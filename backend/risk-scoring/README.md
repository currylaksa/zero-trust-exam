# Risk Scoring Service (Control #26)

Localhost-only Python microservice that scores active exam sessions for
behavioural anomalies using a synthetic-trained Isolation Forest model.
This Stage-1 README covers local setup. Deployment, threshold rationale,
and demo modes are filled in at Stage 6.

## Privacy / ethics

The model is trained on **synthetic data only**. `train.py` takes no
database connection and produces analytic samples; real student data is
never used for training under any circumstance. The service emits
**advisory** scores only — no autonomous action is taken against any
student. Humans (lecturer / invigilator) make all enforcement decisions.

## Local setup

```bash
cd backend/risk-scoring
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python train.py            # produces risk_model.pkl (~few hundred KB)
python service.py          # starts Flask on 127.0.0.1:8001
```

Re-training is a one-shot bootstrap step. `risk_model.pkl` is gitignored
and regenerated on every deploy from the same trainer.

## Endpoints

| Method | Path     | Purpose                               |
|--------|----------|---------------------------------------|
| GET    | /health  | Probe; returns model load status      |
| POST   | /score   | Score a feature vector (5 features)   |

`POST /score` body shape (all five fields required, numeric, non-negative):

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

`session_id` is accepted (echoed in logs) but not used by the model.

Response:

```json
{
  "risk_score": 18,
  "risk_level": "low",
  "contributing_factors": ["normal_session"]
}
```

## Risk bands

| Band   | Score range  |
|--------|--------------|
| low    | < 40         |
| medium | 40 – 70      |
| high   | > 70         |

Threshold rationale will be expanded in Stage 6.

## Security posture (defence in depth)

1. Service binds to `127.0.0.1` only (see `HOST` in `service.py`).
2. `@app.before_request` rejects any request with `remote_addr != 127.0.0.1`
   with HTTP 403, even if the bind were ever changed.
3. UFW deny on port 8001 (configured at the OS layer; not in this repo).

Never bind to `0.0.0.0`. Never proxy via Nginx. Never expose externally.
