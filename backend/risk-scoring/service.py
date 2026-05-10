"""
SecureExam UTM — Behavioral Risk Scoring (Control #26)
Localhost-only Flask microservice serving the IsolationForest scorer.

SECURITY POSTURE — three independent layers:
    1. Bind explicitly to 127.0.0.1 (loopback only).
    2. Reject any request whose remote_addr != '127.0.0.1' at the Flask layer.
    3. UFW deny on port 8001 (configured at the OS layer; not this file).

NEVER bind this service to 0.0.0.0 or expose it via Nginx. Risk scores
are derived from synthetic-trained models and are advisory only — humans
make all enforcement decisions.

Endpoints:
    GET  /health  -> { status, model_loaded, trained_at, sklearn_version }
    POST /score   -> { risk_score (0..100), risk_level, contributing_factors }

Risk bands (documented also in README.md):
    risk_score < 40           : low
    40 <= risk_score <= 70    : medium
    risk_score > 70           : high
"""

import logging
import math
import os

import joblib
import numpy as np
import sklearn
from flask import Flask, abort, jsonify, request

MODEL_PATH = os.environ.get("RISK_MODEL_PATH", "risk_model.pkl")
HOST = "127.0.0.1"
PORT = int(os.environ.get("RISK_SCORER_PORT", "8001"))

LOW_BAND = 40
HIGH_BAND = 70

app = Flask(__name__)
log = logging.getLogger("risk-scorer")
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")

# Loaded once at startup. If load fails, /health returns 503 and /score
# refuses to score so the Node side just warns and skips.
_artefact = None
_load_error = None


def _load_model():
    global _artefact, _load_error
    try:
        _artefact = joblib.load(MODEL_PATH)
        log.info(
            "Loaded model from %s (trained_at=%s, sklearn=%s, n=%d)",
            MODEL_PATH,
            _artefact.get("trained_at"),
            _artefact.get("sklearn_version"),
            _artefact.get("n_samples", -1),
        )
    except Exception as exc:
        _load_error = str(exc)
        log.error("Failed to load model from %s: %s", MODEL_PATH, exc)


_load_model()


@app.before_request
def reject_non_loopback():
    # Defence-in-depth: even if the bind ever drifts off 127.0.0.1, this
    # rejects anything that isn't loopback. The check is cheap and runs
    # before any handler.
    if request.remote_addr != "127.0.0.1":
        log.warning("Rejected non-loopback request from %s", request.remote_addr)
        abort(403)


@app.get("/health")
def health():
    if _artefact is None:
        return jsonify({
            "status": "error",
            "model_loaded": False,
            "error": _load_error,
        }), 503

    return jsonify({
        "status": "ok",
        "model_loaded": True,
        "trained_at": _artefact.get("trained_at"),
        "sklearn_version": _artefact.get("sklearn_version"),
        "feature_order": list(_artefact.get("feature_order", [])),
        "n_samples": _artefact.get("n_samples"),
    })


def _validate_payload(body):
    if not isinstance(body, dict):
        return None, "body must be a JSON object"

    feature_order = _artefact["feature_order"]
    missing = [f for f in feature_order if f not in body]
    if missing:
        return None, f"missing fields: {missing}"

    extras = [k for k in body.keys() if k not in feature_order and k != "session_id"]
    if extras:
        return None, f"unexpected fields: {extras}"

    try:
        vec = [float(body[name]) for name in feature_order]
    except (TypeError, ValueError) as exc:
        return None, f"non-numeric feature: {exc}"

    if any(v < 0 for v in vec):
        return None, "features must be non-negative"

    return np.array(vec, dtype=float).reshape(1, -1), None


def _magnitude_bonus(body):
    """Linear bonus that scales with how far each feature exceeds its training p95.

    Defeats IsolationForest path-length saturation: in training-tail regions
    (anything past ~3x the training p95) decision_function plateaus, so a
    catastrophic session and a moderately anomalous one get nearly identical
    raw scores. This bonus restores expressiveness by adding a deterministic
    per-feature contribution that grows linearly with extremeness.

    Bounded total contribution (default cap 30 points). High weights only
    activate at clearly-extreme inputs because each per-feature contribution
    needs the value to approach its hard limit.
    """
    cfg = _artefact.get("magnitude")
    if cfg is None:
        return 0.0

    fp95 = _artefact["feature_p95"]
    weight = float(cfg.get("weight_per_feature", 14.0))
    cap = float(cfg.get("max_total", 30.0))
    hard = cfg.get("hard_limit", {})

    def excess(val, p95, hard_max):
        denom = max(1e-6, hard_max - p95)
        return max(0.0, min(1.0, (val - p95) / denom))

    contribs = [
        excess(body["tab_switches"],
               fp95["tab_switches"],
               float(hard.get("tab_switches", 20.0))),
        excess(body["total_tab_duration_sec"],
               fp95["total_tab_duration_sec"],
               float(hard.get("total_tab_duration_sec", 600.0))),
        excess(body["mfa_reprompts"],
               fp95["mfa_reprompts"],
               float(hard.get("mfa_reprompts", 5.0))),
        excess(body["session_resumes"],
               fp95["session_resumes"],
               float(hard.get("session_resumes", 4.0))),
    ]
    total = sum(c * weight for c in contribs)

    # Heartbeat count: low is bad (sparse heartbeats).
    # Linearly map [heartbeat_floor, 0] -> [0, 1] then weight at half by default,
    # because without a session_duration feature we can't be sure low counts are
    # genuinely anomalous (a fresh session naturally has few heartbeats).
    floor = float(cfg.get("heartbeat_floor", 5.0))
    hb_factor = float(cfg.get("heartbeat_weight_factor", 0.5))
    hb_excess = max(0.0, min(1.0, (floor - body["heartbeat_count"]) / max(1e-6, floor)))
    total += hb_excess * weight * hb_factor

    return min(total, cap)


def _score_to_risk(decision_value, body):
    """Combine IsolationForest decision_function (anomaly direction) with a
    magnitude bonus (severity past training tail) to produce a 0-100 score.

    Sigmoid: base = 100 / (1 + exp(k * (decision_value - shift)))
      - shift slightly negative anchors the 50% point at a mildly anomalous
        decision_value (not exactly 0), so well-behaved samples score low.
      - k controls steepness — too high compresses the response, too low
        flattens it.

    Magnitude bonus: defeats IF saturation; see _magnitude_bonus().
    Final risk = base + bonus, clipped to [0, 100].
    """
    k = float(_artefact.get("sigmoid_k", 4.0))
    shift = float(_artefact.get("sigmoid_shift", -0.10))
    base = 100.0 / (1.0 + math.exp(k * (decision_value - shift)))
    bonus = _magnitude_bonus(body)
    return int(round(max(0.0, min(100.0, base + bonus))))


def _risk_level(score):
    if score < LOW_BAND:
        return "low"
    if score <= HIGH_BAND:
        return "medium"
    return "high"


def _contributing_factors(body, score):
    """Rule-based per-feature attribution.

    IsolationForest does not produce stable per-feature attributions, so
    factors here are derived from training-time per-feature percentiles.
    Returned as human-readable tags; capped at 3.
    """
    factors = []
    fp95 = _artefact["feature_p95"]

    if body["tab_switches"] > max(fp95["tab_switches"], 2):
        factors.append("frequent_tab_switching")
    if body["total_tab_duration_sec"] > max(fp95["total_tab_duration_sec"], 10):
        factors.append("long_time_off_tab")
    if body["mfa_reprompts"] > max(fp95["mfa_reprompts"], 1):
        factors.append("repeated_step_up_authentication")
    if body["session_resumes"] > max(fp95["session_resumes"], 1):
        factors.append("multiple_session_resumes")
    if body["heartbeat_count"] < 5 and score >= LOW_BAND:
        factors.append("sparse_heartbeats")

    if not factors:
        factors.append("normal_session")

    return factors[:3]


@app.post("/score")
def score():
    if _artefact is None:
        return jsonify({"error": "model not loaded", "detail": _load_error}), 503

    body = request.get_json(silent=True)
    if body is None:
        return jsonify({"error": "invalid or missing JSON body"}), 400

    vec, err = _validate_payload(body)
    if err is not None:
        return jsonify({"error": err}), 400

    decision = float(_artefact["model"].decision_function(vec)[0])
    risk_score = _score_to_risk(decision, body)
    level = _risk_level(risk_score)
    factors = _contributing_factors(body, risk_score)

    return jsonify({
        "risk_score": risk_score,
        "risk_level": level,
        "contributing_factors": factors,
    })


if __name__ == "__main__":
    log.info("Starting risk-scorer on %s:%d (sklearn=%s)", HOST, PORT, sklearn.__version__)
    app.run(host=HOST, port=PORT, debug=False)
