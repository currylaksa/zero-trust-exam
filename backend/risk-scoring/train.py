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
    """Generate a synthetic 'normal exam session' feature matrix.

    Distributions were chosen to reflect a well-behaved student:
    - Most sessions have zero tab switches; a small minority have 1-2 misclicks.
    - When switches happen, the student is away briefly (a few seconds).
    - Step-up MFA reprompts are rare (network blip / accidental refresh).
    - Heartbeat count tracks session length one-per-minute (range 10-90 min).
    - Session resumes are rare; one is plausible after a brief disconnect.

    These are NOT calibrated against real sessions. They define what 'normal'
    looks like to the model; deviations from this distribution are anomalies.
    """
    rng = np.random.default_rng(seed)

    session_minutes = rng.uniform(10, 90, size=n)

    tab_switches = rng.poisson(lam=0.5, size=n).astype(float)

    away_per_switch = rng.exponential(scale=4.0, size=n)
    total_tab_duration_sec = tab_switches * away_per_switch
    total_tab_duration_sec += rng.normal(0, 0.5, size=n).clip(0, None)

    mfa_reprompts = rng.binomial(n=1, p=0.10, size=n).astype(float)

    heartbeat_count = (session_minutes + rng.normal(0, 1.5, size=n)).clip(1, None)

    session_resumes = rng.binomial(n=1, p=0.08, size=n).astype(float)

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

    # Sigmoid steepness for decision_function -> risk_score mapping.
    # k=6 hits: training p95 -> ~18 (low), boundary 0 -> 50 (medium),
    # mild anomaly -0.10 -> ~65 (medium), strong anomaly -0.30 -> ~86 (high).
    # See service._score_to_risk for the formula.
    SIGMOID_K = 6.0

    artefact = {
        "model": model,
        "feature_order": FEATURE_ORDER,
        "p5": p5,
        "p95": p95,
        "feature_p95": feature_p95,
        "feature_p5": feature_p5,
        "sigmoid_k": SIGMOID_K,
        "sklearn_version": sklearn.__version__,
        "trained_at": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0, tzinfo=None).isoformat() + "Z",
        "n_samples": int(N_SAMPLES),
    }

    out_path = "risk_model.pkl"
    joblib.dump(artefact, out_path)
    print(f"[train] Wrote {out_path}")


if __name__ == "__main__":
    main()
