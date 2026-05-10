"""
SecureExam UTM — Behavioral Risk Scoring (Control #26)
Synthetic-data trainer for the IsolationForest anomaly detector.

PRIVACY/ETHICS CONSTRAINT:
This trainer takes NO database connection and NO real student data.
The 5,000-sample training set is generated from analytic distributions
designed to approximate normal exam-session behaviour. Real session data
is never used for training under any circumstance.

Output: risk_model.pkl — a joblib-pickled dict containing:
    - 'model'           : sklearn IsolationForest
    - 'feature_order'   : tuple of the 5 feature names (sent order matters)
    - 'p5'              : 5th-percentile decision_function value (most anomalous in train)
    - 'p95'             : 95th-percentile decision_function value (most normal in train)
    - 'feature_p95'     : per-feature 95th percentile (used for contributing_factors)
    - 'feature_p5'      : per-feature 5th percentile (only heartbeat_count uses this)
    - 'sklearn_version' : version string at training time
    - 'trained_at'      : ISO 8601 timestamp
    - 'n_samples'       : training set size

Usage:
    python train.py
"""

import datetime as _dt
import sys

import joblib
import numpy as np
import sklearn
from sklearn.ensemble import IsolationForest

# Feature order is contractual — the Node side sends fields in this order
# and the Flask service stacks them in this order before predict().
FEATURE_ORDER = (
    "tab_switches",
    "total_tab_duration_sec",
    "mfa_reprompts",
    "heartbeat_count",
    "session_resumes",
)

N_SAMPLES = 5000
RNG_SEED = 42


def synthesise(n=N_SAMPLES, seed=RNG_SEED):
    """Generate a synthetic 'well-behaved exam session' feature matrix.

    Distributions reflect a deliberately well-behaved student so that
    real-world deviations register as anomalous to the model:
      - tab_switches: Poisson(0.3) — most sessions have zero, occasional 1.
        A real-world value of 3+ should be uncommon in training.
      - total_tab_duration_sec: brief moments of inattention only
        (exp scale=2). 5+ seconds should already look anomalous.
      - mfa_reprompts: Bernoulli(0.05) — rare network blips only.
      - heartbeat_count: tracks session length (~1/min) over 15-90 min
        sessions. Sub-10 counts should look short/incomplete.
      - session_resumes: Bernoulli(0.05) — rare brief disconnects.

    These distributions are tighter than v1 (Poisson(0.5), exp(4),
    Bernoulli(0.10)) so user-spec medium/high payloads register further
    out of distribution and the IsolationForest decision_function
    separates them more clearly.

    These are NOT calibrated against real sessions. They define what
    'well-behaved' looks like to the model.
    """
    rng = np.random.default_rng(seed)

    session_minutes = rng.uniform(15, 90, size=n)

    tab_switches = rng.poisson(lam=0.3, size=n).astype(float)

    away_per_switch = rng.exponential(scale=2.0, size=n)
    total_tab_duration_sec = tab_switches * away_per_switch
    total_tab_duration_sec += rng.normal(0, 0.3, size=n).clip(0, None)

    mfa_reprompts = rng.binomial(n=1, p=0.05, size=n).astype(float)

    heartbeat_count = (session_minutes + rng.normal(0, 1.5, size=n)).clip(1, None)

    session_resumes = rng.binomial(n=1, p=0.05, size=n).astype(float)

    return np.column_stack([
        tab_switches,
        total_tab_duration_sec,
        mfa_reprompts,
        heartbeat_count,
        session_resumes,
    ])


def train(X):
    model = IsolationForest(
        contamination=0.05,
        n_estimators=100,
        random_state=RNG_SEED,
    )
    model.fit(X)
    return model


def main():
    print(f"[train] Python {sys.version.split()[0]}, sklearn {sklearn.__version__}")
    print(f"[train] Generating {N_SAMPLES} synthetic normal sessions (seed={RNG_SEED})")
    X = synthesise()
    print(f"[train] Feature matrix shape: {X.shape}")

    print("[train] Fitting IsolationForest(contamination=0.05, n_estimators=100)")
    model = train(X)

    scores = model.decision_function(X)
    p5 = float(np.percentile(scores, 5))
    p95 = float(np.percentile(scores, 95))

    feature_p95 = {name: float(np.percentile(X[:, i], 95))
                   for i, name in enumerate(FEATURE_ORDER)}
    feature_p5 = {name: float(np.percentile(X[:, i], 5))
                  for i, name in enumerate(FEATURE_ORDER)}

    print(f"[train] decision_function p5={p5:.4f}  p95={p95:.4f}")
    print(f"[train] feature p95: {feature_p95}")

    # Score mapping parameters. The risk score combines two signals:
    #
    # 1. SIGMOID base (anomaly detection from IsolationForest):
    #      base = 100 / (1 + exp(SIGMOID_K * (decision_value - SIGMOID_SHIFT)))
    #    SIGMOID_SHIFT < 0 anchors the 50% point at a slightly anomalous
    #    decision_value (not at exactly 0), which gives normal-distribution
    #    samples a low base score.
    #
    # 2. MAGNITUDE bonus (defeats IsolationForest path-length saturation):
    #    For each feature, the linear excess past its training p95 (capped
    #    at a hard limit) contributes up to MAGNITUDE_WEIGHT points.
    #    Sum capped at MAGNITUDE_MAX. This gives clear separation between
    #    "anomalous" (base alone) and "extremely anomalous" (base + bonus)
    #    even though IF's decision_function plateaus.
    #
    # See service._score_to_risk for the implementation.
    SIGMOID_K = 4.0
    SIGMOID_SHIFT = -0.15

    # Per-feature hard limits used by the magnitude bonus.
    # Tab/away/mfa/resumes: high values are bad. Heartbeat: low values are bad.
    MAGNITUDE = {
        "weight_per_feature": 14.0,   # max points contributed by a single feature
        "max_total": 40.0,            # cap on the sum of per-feature contributions
        "hard_limit": {               # value at which each feature contributes 100% of its weight
            "tab_switches": 20.0,
            "total_tab_duration_sec": 600.0,
            "mfa_reprompts": 5.0,
            "session_resumes": 4.0,
        },
        "heartbeat_floor": 5.0,       # heartbeat_count <= 0 contributes 100% of its weight,
                                      # heartbeat_count >= heartbeat_floor contributes 0%
        "heartbeat_weight_factor": 0.5,  # heartbeat magnitude weighted at half (less reliable
                                         # — depends on session duration which we don't carry)
    }

    artefact = {
        "model": model,
        "feature_order": FEATURE_ORDER,
        "p5": p5,
        "p95": p95,
        "feature_p95": feature_p95,
        "feature_p5": feature_p5,
        "sigmoid_k": SIGMOID_K,
        "sigmoid_shift": SIGMOID_SHIFT,
        "magnitude": MAGNITUDE,
        "sklearn_version": sklearn.__version__,
        "trained_at": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0, tzinfo=None).isoformat() + "Z",
        "n_samples": int(N_SAMPLES),
    }

    out_path = "risk_model.pkl"
    joblib.dump(artefact, out_path)
    print(f"[train] Wrote {out_path}")


if __name__ == "__main__":
    main()
