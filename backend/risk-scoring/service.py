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


def _score_to_risk(decision_value):
    # decision_function: higher = more normal, lower = more anomalous.
    # Sigmoid: risk = 100 / (1 + exp(k * decision_value)).
    # k tuned at training time so training p95 maps to low band and
    # decision_value=0 (boundary between normal and anomalous) maps to 50.
    k = _artefact.get("sigmoid_k", 6.0)
    risk = 100.0 / (1.0 + math.exp(k * decision_value))
    return int(round(max(0.0, min(100.0, risk))))


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
    risk_score = _score_to_risk(decision)
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
