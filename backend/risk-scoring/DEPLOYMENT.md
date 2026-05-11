# Deployment Runbook — Behavioral Risk Scoring (Control #26)

This runbook covers the Phase 10 deployment to the SecureExam UTM
production droplet. It introduces:

- One new database table (`SessionRiskScore`), one column retrofit
  (`ExamSession.last_heartbeat`), one composite index.
- One new Python sidecar process (`risk-scorer`, Flask, port 8001
  loopback-only).
- One new Node cron (`riskScorer`, every 30s, registered in
  `server.js`).
- A new repo-root PM2 ecosystem file managing both processes.

Read this document end-to-end before starting. Total elapsed time on
the droplet, including model training and smoke tests, is ~10
minutes. Plan a low-traffic window — though the deploy is designed to
keep the API up throughout, a brief overlap is possible during PM2
process migration (see §5).

## Pre-flight assumptions

Before starting, confirm the droplet has:

- Python 3.10 or newer (`python3 --version`)
- `pip` and the `venv` module
- MySQL 8 with the `secure_exam_db` database and a user that can
  `ALTER TABLE` + `CREATE TABLE` + `CREATE INDEX`
- `pm2` installed and serving the current Node process
- `git` checked out at `~/zero-trust-exam` (or wherever the repo
  lives — paths below assume `~/zero-trust-exam`)
- `ufw` active with `default deny incoming` (verify with
  `sudo ufw status verbose`)

If any of these is missing, stop and remediate before continuing.

---

## 1. Pre-deploy backup

Run on the droplet, **before** anything else:

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p ~/backups
mysqldump -u root -p --single-transaction --quick --triggers \
  --routines secure_exam_db \
  > ~/backups/secure_exam_db.${TS}.sql
ls -lh ~/backups/secure_exam_db.${TS}.sql
echo "Backup timestamp: $TS"
```

Then **immediately**, from your laptop, copy the backup off-droplet:

```bash
mkdir -p ~/secureexam-backups
scp <user>@secureexam-cqy.tech:~/backups/secure_exam_db.${TS}.sql \
    ~/secureexam-backups/
ls -lh ~/secureexam-backups/
```

Replace `<user>` with your SSH username. Replace `${TS}` with the
actual timestamp printed by the droplet command. **Do not skip the
laptop copy** — droplet-only backups don't survive droplet loss.

---

## 2. Pull the feature branch on the droplet

```bash
cd ~/zero-trust-exam
git fetch origin
git status                     # should be clean
git checkout feature/behavioral-risk-scoring
git pull origin feature/behavioral-risk-scoring
git log --oneline -10          # confirm the 7 stage commits are present
```

Expect to see (most recent first):

```
docs(risk-scoring): stage 7 — PM2 ecosystem + deployment runbook
docs(risk-scoring): stage 6 — CONTROL_MAPPING stub, expanded README, demo_seed
feat(risk-scoring): stage 5 — invigilator dashboard frontend extensions
feat(risk-scoring): stage 4 — invigilator dashboard backend extensions
feat(risk-scoring): stage 3 — Node feature extraction and 30s scoring cron
feat(risk-scoring): stage 2 — schema_v5.sql migration
fix(risk-scoring): retune so medium and high payloads separate cleanly
feat(risk-scoring): stage 1 — Python Flask service + IsolationForest trainer
```

---

## 3. Apply the schema migration

```bash
mysql -u root -p secure_exam_db < backend/config/schema_v5.sql
```

Verify with:

```bash
mysql -u root -p secure_exam_db -e "
DESCRIBE SessionRiskScore;
SHOW INDEX FROM SessionRiskScore;
SHOW INDEX FROM ExamSession WHERE Key_name = 'idx_session_status_heartbeat';
SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'secure_exam_db'
    AND TABLE_NAME = 'ExamSession'
    AND COLUMN_NAME = 'last_heartbeat';
"
```

Expected output highlights:

- `SessionRiskScore` has 7 columns, including `risk_score TINYINT
  UNSIGNED`, `risk_level ENUM('low','medium','high')`,
  `contributing_factors JSON`, `features_snapshot JSON`.
- `SessionRiskScore` has indexes `idx_score_session_time` and
  `idx_score_level_time` plus the implicit `PRIMARY`.
- `ExamSession` shows the new `idx_session_status_heartbeat (status,
  last_heartbeat)`.
- `ExamSession.last_heartbeat` exists as `datetime`.

The migration is **idempotent** (uses `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, and a stored-procedure idempotency
wrapper around the index). Running it twice is safe.

---

## 4. Install Python deps and train the model

```bash
cd ~/zero-trust-exam/backend/risk-scoring
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python train.py
ls -lh risk_model.pkl
deactivate
```

Expected:

- `pip install` resolves all four dependencies (`flask`,
  `scikit-learn`, `numpy`, `joblib`) without conflicts.
- `python train.py` prints a `[train] Wrote risk_model.pkl` line.
- The `.pkl` file is ~1.2 MB.

If `pip install` fails with sklearn build errors, the system likely
lacks a C/Fortran toolchain — install `build-essential` and
`gfortran`, or pin a sklearn version with a pre-built wheel for the
droplet's Python version.

---

## 5. Apply the PM2 ecosystem file

There are two scenarios. Identify which applies to your droplet
before running commands.

### Scenario A — droplet currently runs `pm2 start backend/server.js`

The existing process is hand-started. Migrate it without losing
uptime:

```bash
cd ~/zero-trust-exam

# 1. Snapshot the current PM2 state in case we need to recover
pm2 list
pm2 save

# 2. Start the new managed entry for the API. PM2 will refuse if a
#    process with the same name already exists — that's fine; we'll
#    rename if needed.
pm2 start ecosystem.config.js --only secureexam-api

# 3. Verify the new entry is online
pm2 list

# 4. Delete the old hand-started entry (find its name in step 1)
#    Example: if the old name was 'server'
pm2 delete server

# 5. Bring up the Python sidecar
pm2 start ecosystem.config.js --only risk-scorer

# 6. Persist
pm2 save
```

There will be a few seconds of overlap in step 2/3 where both the old
and new API processes are listening on port 5001. Nginx will continue
routing to one or the other. Plan this for a low-traffic moment.

### Scenario B — droplet already uses an ecosystem file

If the current droplet already has an `ecosystem.config.js` managing
the API, the `git pull` in step 2 overwrote it with the new version.
Just reload:

```bash
cd ~/zero-trust-exam
pm2 reload ecosystem.config.js
pm2 save
pm2 list
```

`pm2 reload` brings up the new processes with zero downtime.

### Final state (either scenario)

`pm2 list` should show **both** apps `online`:

```
┌─────┬───────────────────┬─────────────┬─────────┬─────────┐
│ id  │ name              │ namespace   │ status  │ uptime  │
├─────┼───────────────────┼─────────────┼─────────┼─────────┤
│ 0   │ secureexam-api    │ default     │ online  │ ...     │
│ 1   │ risk-scorer       │ default     │ online  │ ...     │
└─────┴───────────────────┴─────────────┴─────────┴─────────┘
```

If `risk-scorer` is `errored`, tail its log:

```bash
pm2 logs risk-scorer --lines 100
```

The most common Stage-1 deployment error is the model file not being
found — re-run `python train.py` inside the venv from §4.

---

## 6. Verify UFW

The Flask service binds to `127.0.0.1` and rejects non-loopback
origins via its `before_request` guard, but we still want explicit
UFW deny on 8001 for defence-in-depth and intent-clarity.

```bash
sudo ufw status verbose | grep -E "(8001|Default)"
```

Expected:

- `Default: deny (incoming)` — the broad default already blocks 8001.
- No explicit `8001 ALLOW` rule.

Add the explicit deny for intent-clarity (this is a no-op if the
default is already deny, but it makes the policy visible in
`ufw status`):

```bash
sudo ufw deny 8001
sudo ufw status verbose | grep 8001
```

Expected to see: `8001  DENY  IN  Anywhere`.

---

## 7. Smoke tests

Run these in order from the droplet shell. Any failure halts the
deploy — proceed to §8 (rollback).

### 7.1  Python service health

```bash
curl -fsS http://127.0.0.1:8001/health | jq
```

Expected JSON (excerpted):

```json
{
  "status": "ok",
  "model_loaded": true,
  "trained_at": "2026-05-XX...Z",
  "sklearn_version": "...",
  "feature_order": ["tab_switches","total_tab_duration_sec","mfa_reprompts","heartbeat_count","session_resumes"],
  "n_samples": 5000
}
```

### 7.2  Low-risk scoring

```bash
curl -fsS http://127.0.0.1:8001/score \
  -H 'Content-Type: application/json' \
  -d '{"session_id":1,"tab_switches":0,"total_tab_duration_sec":0,"mfa_reprompts":0,"heartbeat_count":30,"session_resumes":0}' \
  | jq
```

Expected:

```json
{"risk_score": <under 25>, "risk_level": "low", "contributing_factors": ["normal_session"]}
```

### 7.3  External rejection (defence-in-depth proof)

From **your laptop**, not the droplet:

```bash
curl -fsS --max-time 5 http://secureexam-cqy.tech:8001/health
```

Expected: connection times out or is refused. **Must not return a
response.** If you get any JSON back, the bind is wrong or UFW is
misconfigured — stop and investigate.

### 7.4  End-to-end: real session gets a risk row

This validates the full pipeline (Node cron → feature extraction →
Python scoring → DB write).

1. From the frontend in a browser, log in as a test student account
   and start any published exam.
2. On the droplet, run:

```bash
sleep 35   # wait one full cron tick
mysql -u root -p secure_exam_db -e "
SELECT score_id, session_id, risk_score, risk_level, scored_at
  FROM SessionRiskScore
  ORDER BY scored_at DESC
  LIMIT 5;
"
```

Expected: at least one row inserted within the last 35 seconds, with
a `risk_level` of `low` and a `risk_score` below 30.

If no row appears, tail the Node logs for skip warnings:

```bash
pm2 logs secureexam-api --lines 50 | grep -E "Risk scorer|riskScorer"
```

You should see one summary line per 30s tick: `Risk scorer: scored N,
skipped M of T active session(s)`.

### 7.5  Dashboard verification

1. From the frontend in a browser, log in as a lecturer or admin.
2. Navigate to `/manage/monitoring`.
3. Confirm the **Risk** column appears as the second column.
4. Confirm the test session from §7.4 shows a green "low" pill with
   a score under 30.
5. Click the row — modal opens with the contributing factors and the
   inline sparkline.
6. Confirm the "Open in audit logs" link navigates correctly.

If any of these fails, the production frontend bundle is stale.
Rebuild and redeploy the frontend:

```bash
cd ~/zero-trust-exam/frontend
npm install      # only if package.json changed
npm run build
# then move/symlink dist/ into the Nginx web root, per your existing
# frontend deploy procedure.
```

---

## 8. Rollback

If any smoke test fails, roll back in this order:

```bash
# 1. Stop the Python sidecar and remove it from PM2
pm2 stop risk-scorer
pm2 delete risk-scorer

# 2. Revert the Node side to main (which has no riskScorer cron, no
#    /risk-history endpoint, no dashboard extensions)
cd ~/zero-trust-exam
git checkout main
pm2 reload secureexam-api
```

That's it. **No DB rollback is required:**

- `SessionRiskScore` is a new table with no writers on `main`; it
  stays empty and unused. It can be left in place indefinitely.
- `ExamSession.last_heartbeat` is unchanged behaviour-wise — it was
  already present on production from `update_db_step2.js`; the
  migration's `IF NOT EXISTS` guard was a no-op there.
- `idx_session_status_heartbeat` is additive — no query is broken by
  its presence.

If for some reason you want to fully reverse the schema changes
(unusual), run:

```sql
DROP TABLE IF EXISTS SessionRiskScore;
ALTER TABLE ExamSession DROP INDEX idx_session_status_heartbeat;
-- last_heartbeat column is left intact (production code uses it).
```

After rollback, confirm:

```bash
pm2 list        # only secureexam-api should be visible
curl -fsS http://127.0.0.1:5001/api/health   # 200 ok
```

---

## 9. Post-deploy

After all smoke tests pass:

```bash
pm2 save
pm2 startup     # only if not already configured — verifies pm2
                # will restart both apps after droplet reboot
```

Tail logs for the first few minutes:

```bash
pm2 logs --lines 100
```

Watch for:

- One `Risk scorer: scored N, skipped M of T active session(s)` line
  every 30 seconds in `secureexam-api`.
- No `[riskScorer] session N skipped: ECONNREFUSED` warnings in
  `secureexam-api` (those would indicate the Python service is
  unreachable).
- The Python service log shows the Werkzeug startup banner once, then
  silence (it logs warnings only — rejected non-loopback requests
  appear as `WARNING Rejected non-loopback request from <addr>`).

You're done. Cron will start scoring active sessions automatically.
The dashboard will surface the new Risk column to all lecturers and
admins on their next page load.
