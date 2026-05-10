# Risk Scoring Service (Control #26)

Localhost-only Python microservice that scores active exam sessions for
behavioural anomalies. The model is an Isolation Forest trained on
synthetic data; the service runs as a sidecar to the Node backend on
the same droplet, reachable only on `127.0.0.1:8001`.

This document covers everything an operator or invigilator needs:
local setup, the scoring formula, threshold rationale, deployment, and
the two demo modes used for the Demo 2 panel walkthrough and the
DIGITEX video recording.

## Privacy / ethics

The model is trained on **synthetic data only**. [`train.py`](train.py)
takes no database connection and produces analytic samples; real
student data is never used for training under any circumstance. The
service emits **advisory** scores only — no autonomous action is taken
against any student. Humans (lecturer / invigilator) make all
enforcement decisions, exactly as for the existing 25 Zero-Trust
controls.

## Local setup

```bash
cd backend/risk-scoring
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python train.py            # produces risk_model.pkl (~1.2 MB)
python service.py          # starts Flask on 127.0.0.1:8001
```

Re-training is a one-shot bootstrap step. `risk_model.pkl` is
gitignored and regenerated on every deploy from the same trainer.

## Endpoints

| Method | Path     | Purpose                               |
|--------|----------|---------------------------------------|
| GET    | /health  | Probe; returns model load status      |
| POST   | /score   | Score a feature vector (5 features)   |

`POST /score` body shape (all five features required, numeric,
non-negative; `session_id` accepted and echoed in logs but not used by
the model):

```json
{
  "session_id": 123,
  "tab_switches": 0,
  "total_tab_duration_sec": 0,
  "mfa_reprompts": 0,
  "heartbeat_count": 20,
  "session_resumes": 0
}
```

Response:

```json
{
  "risk_score": 18,
  "risk_level": "low",
  "contributing_factors": ["normal_session"]
}
```

Malformed payloads return `400` with a clear `error` message; a missing
or unloadable model returns `503` with `model_loaded: false`.

## Risk bands

| Band   | Score range  | Visual cue (dashboard) |
|--------|--------------|------------------------|
| low    | < 40         | green pill             |
| medium | 40 – 70      | amber pill             |
| high   | > 70         | red pill               |

## How the score is computed

The risk score (0–100) is a deliberate combination of two signals.
The first comes from the model; the second compensates for a known
limitation of the model and is documented as an architectural
deviation from the original plan.

### Signal 1 — Sigmoid base over IsolationForest `decision_function`

```
base = 100 / (1 + exp(k * (decision_value - shift)))
```

`decision_value` is sklearn's `IsolationForest.decision_function`
output (higher = more normal, lower = more anomalous). The sigmoid
maps it monotonically to `[0, 100]` with three calibration constants
stored in the trained `risk_model.pkl`:

- `sigmoid_k = 4.0` — curve steepness. Lower values flatten the
  response; higher values compress.
- `sigmoid_shift = -0.15` — anchors the 50% point at a *slightly
  anomalous* `decision_value`, not at zero. This makes well-behaved
  samples score genuinely low rather than clustering near 50.

### Signal 2 — Magnitude calibration overlay

```
bonus = sum_per_feature(  clip( (value - p95) / (hard_limit - p95), 0, 1 ) * weight )
        capped at max_total
```

Each of the five features contributes up to `weight_per_feature = 14`
points scaling linearly with its excess past the training-time
`p95`, capped collectively at `max_total = 40`.
[`train.py`](train.py) records the configuration in the artefact;
[`service.py`](service.py) reads it back at request time.

**Why this exists.** Isolation Forest's path-length output saturates
past the training tail: a session with `tab_switches=15` and a session
with `tab_switches=30` produce nearly-identical `decision_function`
values, so the sigmoid alone cannot separate them. The magnitude
overlay restores expressiveness deterministically — catastrophic
sessions visibly exceed merely-anomalous ones.

This was discovered during Stage 1 live testing (the original plan
§3d specified linear-clipped percentile mapping). Tuning the sigmoid
alone could not produce a clean medium-to-high separation; the gap
was 5 points instead of the ~30 points needed for the Demo 2 video
to read decisively. The overlay restored a 29-point gap at the same
risk-band boundaries.

### Verified behaviour

| Input                                 | Score | Band   |
|---------------------------------------|------:|--------|
| `(0, 0, 0, 30, 0)`                    |   17  | low    |
| `(1, 3, 0, 30, 0)` (one misclick)     |   24  | low    |
| `(2, 8, 0, 25, 0)` (borderline)       |   41  | medium |
| `(5, 60, 1, 18, 0)` (medium target)   |   58  | medium |
| `(15, 300, 3, 8, 2)` (high target)    |   87  | high   |
| `(30, 600, 5, 2, 3)` (catastrophic)   |   95  | high   |

The cap at `max_total = 40` prevents the magnitude overlay alone from
forcing a score to 100. True 100s require both base saturation AND
every feature far past its hard limit — by design, "100" is reserved
for truly extreme cases that should not occur in normal operation.

## Synthetic training data

[`train.py`](train.py) generates 5,000 synthetic "well-behaved" sessions
from analytic distributions. Distributions reflect a deliberately
well-behaved student so that real-world deviations register as
anomalous to the model:

| Feature                  | Distribution         | training p95   |
|--------------------------|----------------------|---------------:|
| `tab_switches`           | Poisson(λ=0.3)       | 1              |
| `total_tab_duration_sec` | tab_switches × Exp(scale=2) | ~3.8s   |
| `mfa_reprompts`          | Bernoulli(p=0.05)    | 0              |
| `heartbeat_count`        | Uniform(15, 90)      | ~86            |
| `session_resumes`        | Bernoulli(p=0.05)    | 0              |

These are **not calibrated against real sessions**. They define what
"well-behaved" looks like to the model. Tighter distributions were
chosen during Stage 1 retuning so a single MFA reprompt (`mfa=1`)
already registers as an outlier, not as routine.

## Security posture (defence in depth)

1. Service binds to `127.0.0.1` only — see `HOST` in [`service.py`](service.py).
2. `@app.before_request` rejects any request with `remote_addr != '127.0.0.1'`
   with HTTP 403, even if the bind were ever changed.
3. UFW deny on port 8001 (configured at the OS layer; not in this repo).

Never bind to `0.0.0.0`. Never proxy via Nginx. Never expose externally.
The service has no authentication of its own — the localhost-only
posture *is* the access control.

## Deployment

The risk-scorer is managed by PM2 alongside the Node backend. The
shared ecosystem file is at the repo root: `ecosystem.config.js`
(Stage 7). Deployment runbook lives at
[`DEPLOYMENT.md`](DEPLOYMENT.md) (Stage 7).

Brief checklist:

```bash
# On the droplet, in the project root:
git pull origin feature/behavioral-risk-scoring
mysql -u <user> -p secure_exam_db < backend/config/schema_v5.sql

cd backend/risk-scoring
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python train.py             # generates risk_model.pkl on the droplet

# UFW (default policy is deny incoming; explicit deny for clarity)
sudo ufw deny 8001

# PM2 (see ecosystem.config.js — runs both apps)
pm2 reload ecosystem.config.js
pm2 save

# Smoke test
curl -fsS http://127.0.0.1:8001/health     # expect 200, model_loaded:true
```

`risk_model.pkl` is gitignored — never check the binary into version
control. Re-generate via `python train.py` on the droplet at deploy
time so the model is produced by whatever scikit-learn version
actually runs the service.

## Operations

### "Scoring paused" badge in the dashboard

The dashboard modal renders a "Scoring paused — last score > 90s ago"
badge when the latest `risk_scored_at` for a session is older than 90
seconds. Causes:

- Python service crashed → check `pm2 logs risk-scorer`
- Node `riskScorer` cron not running → check `pm2 logs secureexam-api`
  for `[YYYY-MM-DDTHH:MM:SSZ] Risk scorer: scored N, ...` lines
- Connection between them is failing → look for
  `[riskScorer] session N skipped: ECONNREFUSED` warnings in
  `pm2 logs secureexam-api`

### Re-training the model

The model is regenerated by `python train.py` and is fully
deterministic for a given seed (`RNG_SEED = 42` in `train.py`). To
retrain after editing trainer parameters:

```bash
cd backend/risk-scoring
source venv/bin/activate
python train.py
pm2 restart risk-scorer
```

The Node side does not need a restart — the next 30s tick will use
the freshly-loaded model.

### Recovering from missing model file

If the Flask service starts and `/health` reports
`model_loaded: false`, the pickle is missing or unreadable. Fix:

```bash
cd backend/risk-scoring
source venv/bin/activate
python train.py
pm2 restart risk-scorer
curl -fsS http://127.0.0.1:8001/health     # confirm model_loaded:true
```

## Demo modes

[`demo_seed.sql`](demo_seed.sql) is a parameterised SQL script that
seeds `ActivityLog` and `FlaggedActivity` rows so the live risk-scorer
cron picks them up via the production code path on its next 30-second
tick. The scoring path itself is untouched; only the inputs are
seeded.

Two modes, clearly delimited inside the file:

### LIVE MODE — Demo 2 panel walkthrough (May 25–28, 2026)

A sixty-second `green → amber → red` climb in two paste-able stages.
Wait ~30 seconds between stages so the cron fires once per stage.

```bash
mysql -u root secure_exam_db
```
```sql
SET @session_id := <your_demo_session_id>;
-- paste the LIVE STAGE 1 block
-- wait ~30 seconds; pill flips to medium
-- paste the LIVE STAGE 2 block
-- wait ~30 seconds; pill flips to high
```

### VIDEO MODE — DIGITEX video recording

A pre-seeded session that already shows a medium-amber pill when
recording begins, plus a single trigger block that pushes it past
the high threshold within the next ~30s scoring tick. Workflow:

1. Run the SETUP block off-camera.
2. Wait ~30s for the cron tick → pill flips to medium.
3. Begin screen recording with the dashboard visible.
4. Run the TRIGGER block on-camera.
5. Within ~30s the pill flips to high; sparkline shows the climb.
6. Stop recording.

Both modes use the same production scoring path. There is no demo
shortcut, model fixture, or hardcoded score — only the upstream
behavioural signals are seeded. This means anything the panel or the
video shows is what the system would do under the same real signals.

### After the demo

Clean up by deleting the demo session — FK CASCADE wipes the seeded
`ActivityLog`, `FlaggedActivity`, and `SessionRiskScore` rows
automatically:

```sql
DELETE FROM ExamSession WHERE session_id = <your_demo_session_id>;
```

Critical: `demo_seed.sql` carries a hard disclaimer at the top —
**demo use only, never against production data, runs only against a
dedicated demo session created moments before the demo.**
