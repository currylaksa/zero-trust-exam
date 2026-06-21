# SecureExam UTM — Zero-Trust Control Mapping

> **STATUS — STUB.** This document currently contains the entry for
> **Control #26** only, introduced in Phase 10 (May 2026).
> Documentation for **Controls #1–25** is pending and will be backfilled
> in a dedicated documentation session before **Demo 2** (panel
> walkthrough, week of 2026-05-25 to 2026-05-28).
>
> Until the backfill lands, the 25 prior controls are summarised by
> category here: Authentication (5), Session (5), Browser lockdown (5),
> RBAC (4), Audit & detection (7) — total 25.

---

## Format

Each control entry follows this shape:

- **Title** — one-line description
- **Zero-Trust principle(s)** — *Verify Explicitly* / *Least Privilege* /
  *Assume Breach*
- **Implementation** — concise prose
- **Source** — file:line pointers to the code that enforces it

---

## C1–C25 — pending backfill

(See note above. Will be filled in before Demo 2.)

---

## C26 — Continuous Behavioral Verification

**Continuous, advisory anomaly detection across every active exam session, surfacing per-session risk scores and contributing factors to invigilators without taking autonomous action.**

### Zero-Trust principle

*Assume Breach* (primary) + *Verify Explicitly* (supporting). The control
operates on the assumption that an authenticated session may still be
compromised or coerced, and re-evaluates every session every 30 seconds
for behavioural signals that diverge from a synthetic-trained "normal"
distribution. Verification is continuous, not just at login.

### Scope and constraints

- **Advisory only.** The model writes scores to the database and surfaces
  them in the invigilator dashboard. It never auto-flags, auto-submits,
  or otherwise acts against a student. Humans (lecturer / invigilator)
  make all enforcement decisions.
- **No student-facing UI changes.** Students see no risk indicator.
  Detection is invigilator-only by design.
- **Synthetic training data only.** The Isolation Forest model is trained
  on 5,000 analytically-generated sessions; real student data is never
  used for training under any circumstance.
- **Localhost-only ML service.** The Python scorer binds to 127.0.0.1:8001
  with three independent security layers (loopback bind, Flask
  before_request guard rejecting non-127.0.0.1 origins, OS-level UFW
  deny on 8001). Never exposed via Nginx.
- **Best-effort.** If the Python service is unreachable, the Node backend
  logs a warning and continues serving exams normally. No exam-path
  dependency.

### Implementation

A `node-cron` job runs every 30 seconds, lists every `in_progress` /
`flagged` session, extracts five behavioural features per session from
the existing `ActivityLog` and `FlaggedActivity` tables (no new
telemetry), and `POST`s the feature vector to a localhost-only Flask
service. The Flask service runs the vector through a synthetic-trained
Isolation Forest, returning a 0–100 risk score, a band (`low` / `medium`
/ `high`), and rule-based contributing factors. Scores are stored in
`SessionRiskScore` and surfaced in the existing monitoring dashboard
via a LEFT JOIN on the `getActiveSessions` query.

The score combines two signals:

1. **Sigmoid base** over IsolationForest's `decision_function` —
   captures the model's anomaly-direction signal.
2. **Magnitude calibration overlay** — a deterministic per-feature
   contribution scaled by linear excess past training-time `p95`,
   capped at 40 points. Defeats Isolation Forest's path-length
   saturation: without this, sessions with `tab_switches=15` and
   `tab_switches=30` produce nearly-identical raw scores. The overlay
   restores expressiveness so catastrophic sessions are visibly
   distinguishable from merely-anomalous ones.

The magnitude overlay was a **documented architectural deviation** from
the original plan (§3d). It was added during Stage 1 retuning when live
testing revealed Isolation Forest saturation made the medium-to-high
gradient too narrow to be useful. Documented inline in
`backend/risk-scoring/{train,service}.py` and explained in
`backend/risk-scoring/README.md`.

### Source

| Layer | Path |
|---|---|
| DB migration | [`backend/config/schema_v5.sql`](config/schema_v5.sql) |
| Python trainer | [`backend/risk-scoring/train.py`](risk-scoring/train.py) |
| Python service | [`backend/risk-scoring/service.py`](risk-scoring/service.py) |
| Node cron | [`backend/jobs/riskScorer.js`](jobs/riskScorer.js) |
| Node controller (history endpoint) | [`backend/controllers/riskScoreController.js`](controllers/riskScoreController.js) |
| Node controller (extended sessions endpoint) | [`backend/controllers/monitoringController.js`](controllers/monitoringController.js) |
| Route | [`backend/routes/monitoring.js`](routes/monitoring.js) |
| Frontend (dashboard column + modal + sparkline) | [`frontend/src/pages/MonitoringPanel.jsx`](../frontend/src/pages/MonitoringPanel.jsx) |
| Service docs | [`backend/risk-scoring/README.md`](risk-scoring/README.md) |
| Demo seeding | [`backend/risk-scoring/demo_seed.sql`](risk-scoring/demo_seed.sql) |
