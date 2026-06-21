# SecureExam UTM — Zero-Trust Control Mapping

> **Coverage.** This document maps all **26 zero-trust controls** to the
> code that enforces them, grouped into six families:
> Authentication (C1–C5), Session (C6–C10), Browser lockdown (C11–C15),
> RBAC (C16–C19), Audit & detection (C20–C25), and Continuous Behavioral
> Verification (C26) — **5 + 5 + 5 + 4 + 6 + 1 = 26**.
> Source paths are relative to `backend/` unless prefixed otherwise.

---

## Format

Each control entry follows this shape:

- **Title** — one-line description
- **Zero-Trust principle(s)** — *Verify Explicitly* / *Least Privilege* /
  *Assume Breach*
- **Implementation** — concise prose
- **Source** — file:line pointers to the code that enforces it

---

## Authentication — C1–C5

### C1 — Password hashing at rest
- **Principle:** *Assume Breach*
- **Implementation:** Passwords are never stored in plaintext. `bcryptjs` hashes with cost factor 10 on account creation; login verifies via `bcrypt.compare`.
- **Source:** `controllers/authController.js` (`register`, `login`)

### C2 — Mandatory TOTP multi-factor authentication
- **Principle:** *Verify Explicitly*
- **Implementation:** Every user must complete TOTP MFA before receiving a full JWT. `speakeasy` generates the secret, `qrcode` renders enrollment, and `verifyMFA` checks the 6-digit code (`window: 1`). MFA is enabled on first successful verification.
- **Source:** `controllers/authController.js` (`setupMFA`, `verifyMFA`)

### C3 — Staged, short-lived pre-auth tokens
- **Principle:** *Least Privilege*
- **Implementation:** Login never returns a usable session token directly. It issues a narrow `stage: 'mfa'` temp token (5 min) or `stage: 'mfa_setup'` setup token (10 min) that can *only* drive the MFA step — no API access is granted until MFA passes.
- **Source:** `controllers/authController.js` (`login`)

### C4 — Identity- and IP-bound session JWT
- **Principle:** *Verify Explicitly*
- **Implementation:** The full JWT (15 min expiry) embeds `userId`, `role`, and the issuing client IP, signed with `JWT_SECRET`. Short lifetime limits the blast radius of a stolen token; the embedded IP enables pinning (see C21).
- **Source:** `controllers/authController.js` (`verifyMFA`, `refreshToken`)

### C5 — No public self-registration
- **Principle:** *Least Privilege*
- **Implementation:** The `/register` route is intentionally not exposed. All account creation flows through admin-only `POST /api/users`, so a user cannot self-assign a privileged role. (`authController.register` remains as dead code, unreferenced by any route.)
- **Source:** `routes/auth.js`

---

## Session — C6–C10

### C6 — Server-side session state machine
- **Principle:** *Verify Explicitly*
- **Implementation:** `ExamSession.status` is authoritative and limited to `in_progress` / `completed` / `flagged`. Question fetch, answer save, and submit all reject any session not in an active state, server-side.
- **Source:** `controllers/sessionController.js` (`startSession`, `getSessionQuestions`, `saveAnswer`, `submitExam`)

### C7 — Heartbeat keep-alive with rolling token refresh
- **Principle:** *Assume Breach*
- **Implementation:** The exam client posts a heartbeat every 60 s; the server stamps `ExamSession.last_heartbeat` and returns a freshly minted JWT, so liveness and token rotation are coupled. A 401/403 on heartbeat forces re-login.
- **Source:** `controllers/sessionController.js` (`heartbeat`); `frontend/src/pages/ExamRoom.jsx` (Effect 4)

### C8 — Stale-session auto-submit sweeper
- **Principle:** *Assume Breach*
- **Implementation:** A `node-cron` job (every 5 min) finds active sessions with no heartbeat for ≥ 3 min and finalizes them (auto-grade + status update), logging `AUTO_SUBMIT_TIMEOUT` and raising a medium-severity flag. Prevents indefinitely "open" abandoned sessions.
- **Source:** `jobs/sessionSweeper.js`

### C9 — Step-up MFA on exam resume
- **Principle:** *Verify Explicitly*
- **Implementation:** Resuming an in-progress session requires a fresh TOTP. `initiateResume` issues a 5-min `stage: 'resume_mfa'` token bound to the client IP; `verifyResume` re-checks the IP and re-verifies the OTP before access is restored.
- **Source:** `controllers/sessionController.js` (`initiateResume`, `verifyResume`)

### C10 — Session ownership & single active session
- **Principle:** *Least Privilege*
- **Implementation:** Every session operation re-checks that the session belongs to the requesting user (`WHERE session_id = ? AND user_id = ?`). `startSession` returns 409 if an `in_progress` session already exists for that exam, preventing parallel sessions. Course-enrolled exams also re-check enrollment.
- **Source:** `controllers/sessionController.js` (`startSession`, `getSessionQuestions`, `saveAnswer`, `heartbeat`)

---

## Browser lockdown — C11–C15

### C11 — Fullscreen enforcement
- **Principle:** *Verify Explicitly*
- **Implementation:** The exam room requests fullscreen on entry and listens for `fullscreenchange`. Any exit raises a persistent warning, posts a `FULLSCREEN_EXIT` event, and offers a user-gesture button to re-enter (required because browsers reject programmatic re-entry outside a gesture).
- **Source:** `frontend/src/pages/ExamRoom.jsx` (Effect 1); `controllers/sessionController.js` (`logSuspiciousActivity`)

### C12 — Tab-switch / visibility detection
- **Principle:** *Assume Breach*
- **Implementation:** A `visibilitychange` listener measures time away and posts a `TAB_SWITCH` event with `duration_away_seconds` (filtering out sub-2 s fullscreen jitter). Per-session `tab_switch_count` is incremented server-side.
- **Source:** `frontend/src/pages/ExamRoom.jsx` (Effect 2); `controllers/sessionController.js` (`logSuspiciousActivity`)

### C13 — Copy / paste / cut / right-click blocking
- **Principle:** *Least Privilege*
- **Implementation:** The exam room intercepts `contextmenu`, `copy`, `paste`, and `cut` events and calls `preventDefault`, reducing trivial exfiltration and answer-injection vectors. (Backend also whitelists `COPY_ATTEMPT` / `PASTE_ATTEMPT` / `RIGHT_CLICK` activity types.)
- **Source:** `frontend/src/pages/ExamRoom.jsx` (Effect 3)

### C14 — Threshold auto-flag with post-flag answer nullification
- **Principle:** *Assume Breach*
- **Implementation:** On the 5th tab switch the session is set to `flagged` (high severity) and the lecturer is emailed. At finalization, any answer submitted *after* the first high-severity flag is scored 0, and graders are blocked from awarding marks to post-flag answers.
- **Source:** `controllers/sessionController.js` (`logSuspiciousActivity`, `finalizeSession`, `gradeAnswer`)

### C15 — Time-boxed session enforcement
- **Principle:** *Verify Explicitly*
- **Implementation:** `startSession` rejects attempts outside the exam's `start_time`/`end_time` window. The client runs a countdown off the server `start_time` + `duration` and auto-submits at zero, so the time limit is enforced even if the student does nothing.
- **Source:** `controllers/sessionController.js` (`startSession`); `frontend/src/pages/ExamRoom.jsx` (Effect 5)

---

## RBAC — C16–C19

### C16 — Per-request authentication + user revalidation
- **Principle:** *Verify Explicitly*
- **Implementation:** `verifyZeroTrust` runs on every protected route: it requires a `Bearer` JWT, verifies the signature (distinguishing expired vs invalid), and re-loads the user from the DB so revoked/deleted accounts are rejected even with an otherwise-valid token. `helmet()` adds baseline security headers app-wide.
- **Source:** `middleware/zeroTrust.js` (`verifyZeroTrust`); `server.js`

### C17 — Role-gated routes (least privilege)
- **Principle:** *Least Privilege*
- **Implementation:** `requireRole(...roles)` rejects any authenticated user whose `role` is not explicitly allowed for that route, returning 403. Applied to lecturer/admin/staff/student route groups.
- **Source:** `middleware/zeroTrust.js` (`requireRole`); `routes/monitoring.js`, `routes/admin.js`, etc.

### C18 — Resource ownership scoping
- **Principle:** *Least Privilege*
- **Implementation:** Beyond role, queries are scoped to ownership: lecturers see only sessions/alerts/logs from exams they created; students see only their own sessions/results; admins see all. Enforced in the SQL `WHERE` clauses, not just the UI.
- **Source:** `controllers/monitoringController.js` (`getActiveSessions`, `getAlerts`, `getAuditLogs`, `markAlertReviewed`); `controllers/sessionController.js` (`getSessionResults`, `getExamSubmissions`, `gradeAnswer`)

### C19 — Answer-key minimization
- **Principle:** *Least Privilege*
- **Implementation:** Question payloads sent to the exam client strip `correct_answer` before serialization, so answer keys never reach the browser. Grading comparisons happen only server-side.
- **Source:** `controllers/sessionController.js` (`getSessionQuestions`)

---

## Audit & detection — C20–C25

### C20 — Full API access logging
- **Principle:** *Assume Breach*
- **Implementation:** Every authenticated request writes an `API_ACCESS` row to `ActivityLog` (method + URL + user), creating a tamper-evident access trail and the raw signal later consumed by Control #26.
- **Source:** `middleware/zeroTrust.js` (`verifyZeroTrust`)

### C21 — IP pinning
- **Principle:** *Assume Breach*
- **Implementation:** The IP embedded in the JWT (C4) is compared against the real client IP (`trust proxy` resolves `X-Forwarded-For` behind Nginx) on every request. A mismatch logs `IP_MISMATCH` and returns 403, defeating token replay from a different location.
- **Source:** `middleware/zeroTrust.js` (`verifyZeroTrust`); `server.js` (`app.set('trust proxy', 1)`)

### C22 — Exam lifecycle audit trail
- **Principle:** *Verify Explicitly*
- **Implementation:** Distinct, filterable activity types are recorded across the lifecycle — `LOGIN`, `TOKEN_REFRESH`, `EXAM_START`, `HEARTBEAT`, `EXAM_SUBMIT`, `GRADE_ANSWER`, `RESUME_INITIATED`, `RESUME_VERIFIED`, `AUTO_SUBMIT_TIMEOUT`.
- **Source:** `controllers/authController.js`, `controllers/sessionController.js`, `jobs/sessionSweeper.js`

### C23 — Violation capture with severity bands
- **Principle:** *Assume Breach*
- **Implementation:** Client integrity violations are persisted to `FlaggedActivity` with a `severity` band (`low` / `medium` / `high`) and optional `duration_away_seconds`, driving both invigilator triage and the scoring features.
- **Source:** `controllers/sessionController.js` (`logSuspiciousActivity`); `jobs/sessionSweeper.js`

### C24 — Invigilator monitoring & alert-review workflow
- **Principle:** *Verify Explicitly*
- **Implementation:** Lecturers/admins get a live view of active sessions (with tab-switch totals, fullscreen exits, and the latest risk score joined in) plus an alert queue they can mark reviewed. Ownership-scoped per C18.
- **Source:** `controllers/monitoringController.js` (`getActiveSessions`, `getAlerts`, `markAlertReviewed`)

### C25 — Searchable, paginated audit log
- **Principle:** *Verify Explicitly*
- **Implementation:** `getAuditLogs` exposes the full trail with filters (user, session, activity type, date, free-text search) and pagination, role-scoped so lecturers only see logs from their own exams.
- **Source:** `controllers/monitoringController.js` (`getAuditLogs`)

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
