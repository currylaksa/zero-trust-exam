# Micron Round 2 — FYP Deep-Dive Prep
**Project:** SecureExam UTM — A Zero-Trust Exam Platform
**Your Role:** Sole developer (design, backend, frontend, DB, deployment)
**Supervisor:** Dr Siti Hajar
**Scale:** ~8,100 LOC, 25 Zero-Trust controls, 9 phases

---

## 0. The 60-Second Elevator Pitch (Memorize This)

> "My FYP is **SecureExam UTM**, a Zero-Trust online examination platform I built for UTM's Open Distance Learning programme. The problem it solves is that traditional online exam systems still operate on an implicit-trust model — once you log in, you're trusted for the whole session. My system applies the Zero-Trust principle *'never trust, always verify'* by re-verifying the student on **every single API call** — JWT validity, IP binding, user existence, and role. On top of that it adds continuous behaviour monitoring — tab-switches, fullscreen exits, heartbeats, step-up MFA when resuming. The stack is **Node.js + Express + MySQL on the backend, React + Vite + Tailwind on the frontend**, and I implemented **25 distinct Zero-Trust controls** across authentication, session, browser, and audit layers. It's about 8,100 lines of code, fully working end-to-end."

Then stop. Let them ask the next question.

---

## 1. THE 4 ZERO-TRUST CHECKS ON EVERY REQUEST

> *"Walk me through how your Zero-Trust middleware works."*

Every protected API call passes through `backend/middleware/zeroTrust.js → verifyZeroTrust`. It performs **four sequential checks**, and fails-closed on any failure:

**Check 1 — JWT presence & validity**
- Reads `Authorization: Bearer <token>` header.
- Verifies signature with `jwt.verify(token, JWT_SECRET)`.
- Catches `TokenExpiredError` → returns **401 'Token expired'**.
- Any other malformed token → returns **403 'Invalid token'**.
- If `JWT_SECRET` env var is missing → returns **500** (no fallback secret, ever).

**Check 2 — User-existence re-verification**
- Extracts `userId` from the JWT payload.
- `SELECT * FROM User WHERE user_id = ?` on **every request**.
- If the user was deleted after the token was issued, the token becomes useless immediately. Returns **401 'User not found'**.

**Check 3 — IP binding (session location lock)**
- At login time, the client IP is embedded in the JWT payload: `{ userId, email, role, ip }`.
- On every request, middleware compares `payload.ip` with `req.ip`.
- Mismatch → logs `IP_MISMATCH` to `ActivityLog`, returns **403 'Session invalid: location changed'**.
- Defends against session hijacking — if someone steals the token and uses it from a different network, the request is blocked.

**Check 4 — Audit logging**
- Every successful request inserts a row into `ActivityLog` with `activity_type = 'API_ACCESS'` and the method + URL.
- This is the audit trail for compliance and anomaly detection.

Only after all four pass is `req.user` populated and `next()` called. Role-based access control (`requireRole('lecturer','admin')`) is a separate middleware that runs after `verifyZeroTrust`.

**Key soundbite:** *"It's defence-in-depth. Even if one layer fails — say the JWT is stolen — the IP check or the user-existence check catches it."*

---

## 2. JWT + STAGED MFA (THE TOKEN STATE MACHINE)

> *"How did you implement MFA and the JWT stage machine?"*

I use **three distinct JWT types** with different payloads and expiries. The `stage` claim prevents token confusion.

| Token Type | Payload | Expiry | Used For |
|---|---|---|---|
| **Full JWT** | `{ userId, email, username, role, ip }` | 15 min | Normal API access |
| **Temp MFA token** | `{ userId, stage: 'mfa' }` | 5 min | Between password success and OTP verification |
| **Resume MFA token** | `{ userId, sessionId, stage: 'resume_mfa', ip }` | 5 min | Step-up MFA to resume an in-progress exam |

**Login-with-MFA flow:**
1. User submits email + password. Backend `bcrypt.compare()` against hash.
2. If `user.mfa_enabled === true`, backend issues the **temp MFA token** and returns `{ mfaRequired: true, tempToken }`. **No LOGIN activity is logged yet** — login isn't "complete" until MFA passes.
3. Frontend navigates to `/verify-mfa`, user enters 6-digit TOTP.
4. Backend `jwt.verify(tempToken)`, checks `stage === 'mfa'`, then `speakeasy.totp.verify({ secret: user.mfa_secret, token: otp, window: 1 })`.
5. `window: 1` means I accept the current 30-second time slot ± 1 slot — tolerates small clock skew without being loose.
6. On success, issue the **full JWT** with the client's current IP bound in.

**TOTP is RFC 6238** — the secret is shared at setup time via QR code (otpauth URL → `qrcode.toDataURL()` → scanned by Google Authenticator). Every 30 seconds, HMAC-SHA1(secret, counter=current_30s_epoch) generates a new 6-digit code. Verifying means recomputing the HMAC server-side and comparing.

**Why a separate temp token instead of a session flag?** Statelessness. The backend holds no session state for in-progress MFA — the token *is* the state. If the user abandons the MFA step, the temp token simply expires in 5 minutes; there's nothing to clean up.

---

## 3. HEARTBEAT + TOKEN ROTATION

> *"Explain the heartbeat and how it rotates the JWT."*

**Mechanism:** Every 60 seconds, the `ExamRoom.jsx` frontend calls `POST /api/sessions/:id/heartbeat`. On the backend (`sessionController.heartbeat`):

1. Standard Zero-Trust middleware runs first (JWT, IP, user-exists, log).
2. Checks the session belongs to this user AND is `in_progress` or `flagged`.
3. Inserts a `HEARTBEAT` row into `ActivityLog`.
4. Updates `ExamSession.last_heartbeat = NOW()`.
5. **Signs a new JWT** with the same payload but with a fresh `expiresIn` (default 15m, from `JWT_EXPIRES_IN`).
6. Returns `{ alive: true, token: newToken }`.
7. Frontend replaces `localStorage('exam_token')` with the new token.

**Why this is clever (standout point):**

- **Short-lived-by-default, alive-while-active.** The baseline JWT expires in 15 min. A student actively taking an exam gets silently refreshed every minute. But if they walk away (no heartbeat), the token naturally expires and the sweeper marks the session abandoned.
- **Continuous presence verification.** The heartbeat isn't just a keep-alive — it's a liveness check. Combined with the session sweeper (§7), it detects physical abandonment.
- **Zero-Trust "Assume Breach" + "Verify Explicitly".** Short token + periodic re-issuance means a stolen token's blast radius is capped at 15 minutes, and re-issuance happens only when the student is provably still there.

**Interviewer trap:** "Isn't rotating on a heartbeat insecure because the attacker could also just replay heartbeats?"
**Answer:** "The heartbeat itself is authenticated by the same JWT and IP-bound. An attacker replaying heartbeats would still need the IP-bound token, which they can't get without first defeating all four middleware checks. The heartbeat extends liveness; it doesn't weaken the initial auth."

---

## 4. BROWSER LOCKDOWN — CLIENT SIDE + SERVER SIDE

> *"How does the browser lockdown work — both sides?"*

I want to stress a framing point: **the browser can never be truly locked down** — any determined student can Alt+Tab, use a second device, or inspect DevTools. The goal isn't perfect prevention; it's **raising the cost of cheating and leaving an evidence trail**. That's why every "client-side block" is paired with a "server-side log".

### Client-side (`ExamRoom.jsx` — 5 useEffects)

| Effect | Mechanism |
|---|---|
| **1. Fullscreen enforcer** | `document.documentElement.requestFullscreen()` on mount. Listens to `fullscreenchange` — on exit, logs `FULLSCREEN_EXIT` and re-requests fullscreen after 3 seconds. |
| **2. Tab-visibility tracker** | Listens to `visibilitychange`. When `document.hidden === true`, store `tabHiddenAt = Date.now()`. When visible again, compute `duration_away_seconds` and POST `TAB_SWITCH` with the duration. |
| **3. Copy/paste/right-click block** | `document.addEventListener('contextmenu'/'copy'/'paste'/'cut', e => e.preventDefault())`. |
| **4. Heartbeat** | `setInterval(heartbeat, 60000)`. |
| **5. Auto-submit timer** | Countdown based on `start_time + duration`. At zero, auto-POST submit. |

**A subtle engineering choice:** I had to debounce the tab-switch detector against fullscreen-exit because `requestFullscreen()` transitions also fire `visibilitychange`. I track `lastFullscreenExitAt` and skip logging if the visibility event lands within 2 seconds of a fullscreen exit **and** `duration_away_seconds === 0`. Without this, every fullscreen exit would falsely log as a tab switch too.

### Server-side — the real enforcement

Everything client-side is a **best-effort deterrent**. The real security is on the server:

- Every `TAB_SWITCH` increments `ExamSession.tab_switch_count`. At **≥5**, status is flipped to `'flagged'`, a `FlaggedActivity` row is inserted with severity `'high'`, and the lecturer gets an **email alert**.
- Every flagged event is written to both `ActivityLog` (raw event stream) and `FlaggedActivity` (human-reviewable alerts).
- After a session is flagged, **any answer submitted after the flag timestamp has its score nullified to 0** — enforced in `submitExam` by comparing `submitted_at > flaggedAt`.

**Key soundbite:** *"Client-side prevents casual cheating; server-side makes sophisticated cheating detectable and auditable. That's Zero-Trust's 'assume breach' principle in action."*

---

## 5. THE 6-STATE EXAM LIFECYCLE

> *"Walk me through the session state machine."*

`ExamSession.status` is an ENUM with four stored values, but conceptually there are **6 lifecycle states**:

```
              NOT_STARTED
                   │
                   │  POST /sessions/start/:examId
                   ▼
             in_progress ─────────────────────────┐
                 │  │                              │
                 │  │ ≥5 tab switches              │ No heartbeat
                 │  ▼                              │ for 3+ min
                 │ flagged                         ▼
                 │  │                         abandoned
                 │  │
                 │  │ POST /sessions/:id/submit  (from in_progress OR flagged)
                 │  ▼
                 │ completed ────────────────▶ Results page
                 ▼
             completed
```

**State transitions:**

| Transition | Trigger | Where |
|---|---|---|
| `NOT_STARTED → in_progress` | Student clicks "Start Exam" + acknowledges regulations | `startSession` |
| `in_progress → flagged` | 5th `TAB_SWITCH` event | `logSuspiciousActivity` |
| `in_progress → abandoned` | No heartbeat for ≥3 min | `sessionSweeper` cron |
| `flagged → completed` | Student submits (post-flag answers = 0) | `submitExam` |
| `in_progress → completed` | Normal submit OR timer expiry auto-submit | `submitExam` |
| `* → abandoned` | Only `in_progress` with missed heartbeats | `sessionSweeper` |

**Gotchas to mention:**
- A flagged session is **still resumable** — I don't lock the student out immediately. The exam continues, but all post-flag answers get nullified. This matches the academic fairness requirement (no automatic "fail" — human lecturer reviews).
- Resume from `in_progress` requires **step-up MFA** (§6), even though the student already has a valid JWT.
- The `completed` end state is terminal — submission is idempotent.

---

## 6. STEP-UP MFA FOR EXAM RESUME

> *"Why step-up MFA when the user already has a valid token?"*

This is one of the **strongest Zero-Trust points** in the project.

**The scenario:** Student starts an exam, minimises the browser, answers 30 minutes, leaves for lunch. Comes back. JWT is still valid (rotated by heartbeat). They click "Continue" — what should happen?

**In a traditional system:** They resume immediately because they have a token.

**In my system:** Zero-Trust says *"the trust expires with context, not just time."* An unattended device is a context change. So I force a **step-up authentication**.

**Flow:**
1. `POST /sessions/:id/initiate-resume` — verifies session is `in_progress`, issues a 5-minute **resume token** with `stage: 'resume_mfa'` and the current IP.
2. Frontend navigates to `/resume-verify`. User enters 6-digit TOTP.
3. `POST /sessions/verify-resume` with `{ resumeToken, otp }`.
4. Backend: `jwt.verify`, check `stage === 'resume_mfa'`, check `decoded.ip === req.ip`, verify OTP via `speakeasy.totp.verify`.
5. Logs `RESUME_VERIFIED` to `ActivityLog`. Returns `{ verified: true, sessionId }`.
6. Frontend navigates back to `/exam/:sessionId`.

**Why a separate token type?** So the resume token cannot be used for any other API call. If a student tried to use it to submit or save answers, the middleware would reject it because the payload lacks `email`/`role` — a defence-in-depth measure against token reuse.

**NIST framing:** NIST SP 800-207 (Zero-Trust Architecture) explicitly recommends **continuous trust evaluation** and **step-up auth on privileged or sensitive actions**. Resuming an exam is exactly that.

---

## 7. SESSION SWEEPER (THE CRON JOB)

> *"What happens if a student closes their laptop mid-exam?"*

`backend/jobs/sessionSweeper.js` runs every 5 minutes (plus once at server start).

```sql
SELECT session_id, user_id
FROM ExamSession
WHERE status = 'in_progress'
  AND last_heartbeat IS NOT NULL
  AND TIMESTAMPDIFF(MINUTE, last_heartbeat, NOW()) >= 3;
```

For each row returned:
1. `UPDATE ExamSession SET status = 'abandoned'`.
2. `INSERT INTO ActivityLog` with `activity_type='SESSION_ABANDONED'`.
3. `INSERT INTO FlaggedActivity` with `severity='high'`, flag reason `'Heartbeat timeout — possible abandonment'`.

**Why 3 min, cron at 5 min?** The heartbeat runs every 60 seconds. A 3-minute threshold tolerates **3 missed heartbeats** before flagging — enough to survive a momentary WiFi blip, tight enough to catch real abandonment. The cron at 5 min is a compromise between responsiveness and DB load — real systems would probably use a message queue here.

**Interview stretch:** *"In a production version, I'd replace node-cron with a proper job queue like BullMQ backed by Redis, so the sweeper can scale horizontally and I can retry on failure. Node-cron is single-node and would duplicate work if I scaled the API out."*

---

## 8. FISHER-YATES SHUFFLE + ANSWER-KEY STRIPPING

> *"Why shuffle questions? What algorithm?"*

**Fisher-Yates (Knuth) shuffle:**
```javascript
for (let i = a.length - 1; i > 0; i -= 1) {
  const j = Math.floor(Math.random() * (i + 1));
  [a[i], a[j]] = [a[j], a[i]];
}
```

**Why it matters:**
- **O(n) time, O(1) extra space** (in-place).
- **Unbiased** — every permutation of n elements is equally likely (P = 1/n!). A naive `sort(() => Math.random() - 0.5)` is biased toward certain permutations because it uses a non-transitive comparator.
- Applied to **every student's question list individually** → two students sitting side-by-side see different question orders, reducing copying.

**Answer-key stripping (a parallel control):** When sending questions to the student via `getSessionQuestions`, I `.map()` each row to strip the `correct_answer` field. Students never see the key; lecturers and admins do. This is "least privilege applied to data".

---

## 9. WHY RAW SQL INSTEAD OF AN ORM?

> *"Why not use Sequelize/Prisma/TypeORM?"*

Multiple reasons, in order of importance:

1. **Predictability for a security-critical app.** I always know exactly what SQL hits the database. With an ORM, a lazy-loaded relation can trigger N+1 queries silently, which both hurts performance and fouls audit logs.
2. **Parameterized queries give SQL-injection safety for free.** Every query uses `?` placeholders + `db.execute([params])`. The mysql2 driver handles escaping. There is **not a single string-concatenated query** in my codebase.
3. **Learning goal.** I wanted to prove I understood SQL itself — JOINs, indexes, transactions, ENUMs, FK constraints — rather than relying on an abstraction that hides them.
4. **Schema migration control.** Phases 8 / 9 / 9.1 added columns to existing tables. I wrote explicit migration files (`schema_v2.sql`, `schema_v3.sql`, `schema_v4.sql`) using `ADD COLUMN IF NOT EXISTS` — idempotent and safe to re-run.
5. **Bundle size + cold-start.** `mysql2` is ~40 KB; Sequelize is ~1.5 MB. Not decisive, but relevant.

**Honest trade-off to admit:** *"The downside is more boilerplate and no TypeScript type-safety on query results. For a larger team project I'd consider Prisma, because the migration tooling and generated types are excellent. But for a single-developer security-focused FYP, raw SQL was the right call."*

---

## 10. DATABASE DESIGN HIGHLIGHTS

> *"Walk me through your schema."*

**11 tables.** The interesting ones for Micron:

| Table | Purpose | Key Features |
|---|---|---|
| `User` | All identities | `role` ENUM (student/lecturer/staff/admin), `mfa_secret`, `mfa_enabled` |
| `Exam` | Exam metadata | `status` ENUM (draft/published/archived), time window, FK to `Course` |
| `Question` | Exam questions | `question_type` ENUM (mcq/short/essay), `options` **JSON** column, `marks` |
| `ExamSession` | One row per student-attempt | `status` ENUM (in_progress/completed/flagged/abandoned), `last_heartbeat`, `tab_switch_count`, `ip_address` |
| `Answer` | Student answers | `session_id + question_id` unique; `score` auto-graded for MCQ |
| `ActivityLog` | Append-only audit stream | Every API access, login, heartbeat, tab switch, IP mismatch |
| `FlaggedActivity` | Reviewable alerts | `severity` ENUM, `reviewed` boolean, `duration_away_seconds` |

**Design points worth bragging about:**

1. **Separation of raw events vs. reviewable alerts.** `ActivityLog` is firehose; `FlaggedActivity` is the lecturer's inbox. Two different UI surfaces, two different access patterns.
2. **Cascade rules are explicit.** Deleting an exam cascades to `Question`, `ExamSession`, `Answer`. But deleting a user who created exams uses `RESTRICT` — you can't accidentally wipe an exam because you deleted a lecturer.
3. **JSON column for MCQ options** — flexible (2–N options per question) without joining a separate table.
4. **`duration_away_seconds`** was added in Phase 9 via `schema_v3.sql` — a retrofitted column showing I thought about migrations after initial design.

---

## 11. 25 ZERO-TRUST CONTROLS — THE BIG PICTURE

If they ask *"can you summarise everything you built?"*, rattle off the categories (don't list all 25):

| Layer | Controls | Count |
|---|---|---|
| **Authentication** | JWT on every request, TOTP MFA, step-up MFA on resume, no fallback secret | 5 |
| **Session** | IP binding, short-lived JWT, heartbeat rotation, session sweeper, time-window enforcement | 5 |
| **Browser lockdown** | Fullscreen enforcement, tab-switch detect, copy/paste block, duration tracking, auto-submit | 5 |
| **Authorization / RBAC** | Role-based route guards, course enrollment check, lecturer course-ownership, answer-key stripping | 4 |
| **Audit & detection** | `ActivityLog`, `FlaggedActivity`, email alerts, monitoring dashboard, score nullification, question shuffling, regulations transparency | 7 |

**Total: 25 controls** mapped to the three Zero-Trust principles — **Verify Explicitly, Least Privilege, Assume Breach**.

---

# SECTION B — LIKELY FOLLOW-UP QUESTIONS (+ model answers)

These are the harder questions the senior engineer will probe with. Prepare a 60-second answer to each.

### Q1. "What's the hardest bug you hit?"

> *"Two stand out. First — the fullscreen/visibility race condition. Browsers fire `visibilitychange` during fullscreen transitions, so every time the student legitimately entered fullscreen, my system would false-log a `TAB_SWITCH`. I fixed it by tracking `lastFullscreenExitAt` as a ref and ignoring visibility events within a 2-second window where `duration_away_seconds === 0`. Second — a JWT silently verifying with a fallback secret when `JWT_SECRET` wasn't loaded from `.env` during a deploy. That meant two of my environments had cryptographically valid tokens that couldn't verify against each other. I removed every fallback secret and made JWT operations fail-closed with a 500 — no signing, no verifying, unless the env var is explicitly set."*

### Q2. "What would you do differently if you rebuilt it?"

> *"Three things. **One — use TypeScript end-to-end.** My API contract between frontend and backend is implicit right now; shared types would prevent whole classes of bugs. **Two — replace localStorage with httpOnly cookies** for JWT storage. localStorage is vulnerable to XSS; a proper httpOnly secure cookie with SameSite=strict is standard now. **Three — real WebSocket monitoring for lecturers** instead of 30-second polling. It would drop dashboard latency from avg 15s to sub-second and halve database load."*

### Q3. "How would you scale this to 10,000 concurrent students?"

> *Structured answer — go layer by layer:*
> - **Stateless API layer** (already stateless — JWT based) → horizontally scale Node behind a load balancer.
> - **DB: MySQL becomes the bottleneck.** Read replicas for the monitoring dashboard queries. Primary for writes (answers, logs). Partition `ActivityLog` by date.
> - **Activity log writes** (currently synchronous in middleware) → push to a message queue (Kafka / SQS), consumer writes to DB. Middleware returns faster; logs are eventually-consistent.
> - **Session sweeper** → replace node-cron with BullMQ on Redis. Supports horizontal workers and retries.
> - **WebSocket for heartbeats** instead of HTTP POST every 60s. Persistent connection = lower overhead.
> - **CDN + gzip** for frontend bundle. Serve static React build from S3/CloudFront.

### Q4. "What's the difference between authentication and authorization — and where does each live in your code?"

> *"Authentication answers **'who are you?'** — that's the login flow (bcrypt + MFA) and the JWT verification in my middleware. Authorization answers **'are you allowed to do this?'** — that's my `requireRole('lecturer','admin')` middleware plus the business-logic checks inside each controller, like checking a lecturer owns a course before editing its exams, or a student is enrolled before starting an exam. My `verifyZeroTrust` middleware does AuthN; `requireRole` + per-controller guards do AuthZ. They're deliberately decoupled."*

### Q5. "What is SQL injection and how did you prevent it?"

> *"SQL injection is when an attacker smuggles SQL syntax into a user-input field, tricking the server into running code like `'; DROP TABLE User; --`. I prevent it with **parameterized queries everywhere** — every `db.execute()` call in my codebase uses `?` placeholders with arguments passed as a separate array. The mysql2 driver sends the query and parameters to the DB on separate channels; the DB parser treats parameters as pure data, never as SQL. There is not a single string-concatenated query in my 8,100 lines. I also use **principle of least privilege** at the DB level — the app user has only the privileges it needs (no DROP, no GRANT)."*

### Q6. "Walk me through OWASP Top 10 in the context of your system."

Pick 5–6 — don't try to cover all 10:

- **A01 Broken Access Control** — solved by my layered AuthZ (middleware + per-controller ownership checks).
- **A02 Cryptographic Failures** — bcrypt for passwords (salt auto-generated, cost 10), HMAC-SHA256 for JWT signing, TOTP secret only stored server-side.
- **A03 Injection** — parameterized SQL everywhere.
- **A05 Security Misconfiguration** — Helmet sets security headers (CSP, X-Frame-Options, HSTS). CORS locked to the Vite dev origin.
- **A07 ID & Auth Failures** — MFA (TOTP), rate limiting via `express-rate-limit`, short-lived JWTs, no fallback secrets.
- **A09 Security Logging & Monitoring** — `ActivityLog` + `FlaggedActivity` give full audit trail; lecturer monitoring dashboard surfaces anomalies.

### Q7. "What's a race condition, and is there one in your code?"

> *"A race condition is when two operations execute in an interleaving that produces a wrong result because they both touch shared state. The classic example is two threads doing `counter++` — if they both read the old value before either writes, they both write `old+1` and one increment is lost. In my code, the place I thought about this most was the tab-switch counter: `SELECT tab_switch_count` then `UPDATE SET tab_switch_count = newValue`. Two concurrent log requests could both read the same old count and both flag at 5 when one should have flagged at 5 and the other at 6. In practice it's rare because a single student doesn't trigger simultaneous events, but the fix would be an atomic `UPDATE ... SET tab_switch_count = tab_switch_count + 1` — a read-modify-write in a single SQL statement — or wrapping it in a transaction with `SELECT ... FOR UPDATE`."*

### Q8. "What's the difference between a process and a thread?"

Classic OS question. Short answer:

> *"A **process** is an independent execution unit with its own memory space, file descriptors, and PID — OS-scheduled and heavy to create. A **thread** is a lighter execution unit that shares memory and file descriptors with other threads in the same process, so context switches are cheap and inter-thread communication is just shared variables — but that sharing is exactly what makes thread-safety (mutexes, atomics) hard. Node.js, where my backend runs, is **single-threaded for JavaScript execution** using an event loop — which is why I don't deal with thread-level race conditions in the app code. The DB and I/O do their own concurrency, and Node handles the coordination via async/await."*

### Q9. "Why Zero-Trust? Why not just use a VPN?"

> *"VPN is the old 'perimeter' model — once you're inside, you're trusted. It fails when (a) the VPN credentials are phished, or (b) an insider goes rogue. Zero-Trust flips it: **there is no inside**. Every request is verified regardless of origin. For a manufacturing environment like Micron's, this matters because engineering workstations, MES systems, and factory-floor devices all talk to each other — perimeter doesn't exist in a meaningful sense. My FYP is a microcosm of that: a student's JWT isn't trusted just because they're logged in; it's re-verified on every call."*

### Q10. "What does Zero-Trust have to do with manufacturing IT?"

*This is the Micron-specific bridge question. Nail it.*

> *"Manufacturing IT is converging OT and IT — factory floor control systems, MES, SCADA, ERP all sit on shared networks now. The traditional air-gap is dissolving. Zero-Trust is the current industry answer: NIST 800-207, the US CISA guidance, and companies like Siemens and Rockwell are all adopting it. My FYP taught me the engineering patterns — short-lived tokens, continuous verification, audit-everything, step-up auth for sensitive actions. Those exact patterns apply when an engineering workstation needs to push a recipe to a fab tool, or when a vendor needs temporary access to a logger. I'd be bringing a working mental model of Zero-Trust into Micron, not just the keyword."*

---

# SECTION C — YOUR STANDOUT / DIFFERENTIATOR POINTS

Work these in whenever you get a pause. These are **what makes you memorable** vs. other fresh grads:

1. **"I built 25 Zero-Trust controls across 5 architectural layers as a single developer."** — Most FYPs are feature demos; yours is a coherent security architecture.
2. **"I wrote 8,100 lines of production-quality code with zero TODOs, zero FIXMEs, and explicit fail-closed behaviour throughout."** — Shows discipline.
3. **"Every JWT operation checks for `JWT_SECRET` and refuses to run if it's missing — there is no fallback secret anywhere in the codebase."** — Concrete evidence of security-first thinking.
4. **"I implemented a proper Fisher-Yates shuffle, knowing the biased `sort(() => Math.random())` trick most people use."** — Algorithmic awareness.
5. **"I explicitly versioned my DB migrations (schema_v2, v3, v4) with idempotent `ADD COLUMN IF NOT EXISTS`."** — Operational maturity.
6. **"I designed a 3-tier token system — full JWT / temp MFA / resume MFA — each with different payload and stage claims to prevent token reuse."** — Shows you understand authentication nuance.
7. **"I added an explicit `duration_away_seconds` column so lecturers can distinguish a 5-second misclick from a 3-minute absence."** — Human-centred design, not just paranoid security.
8. **"I used parameterized queries throughout with mysql2's prepared statements — SQL injection is structurally impossible, not just filtered."** — This is the exact right wording.

---

# SECTION D — DEEPER TECHNICAL PROBES (BE READY)

### On Node.js / Express internals
- **Q:** Is Express single-threaded? *→ "Yes, Node's event loop is single-threaded for JS. I/O is non-blocking via libuv. CPU-heavy work would block — in my app bcrypt is the only real cost, and it's still OK because login is rare vs. API calls."*
- **Q:** What is middleware? *→ "A function with signature `(req, res, next)`. Middleware chains by calling `next()`. Mine short-circuits with `res.status().json()` on auth failure — never calls `next()`, so the request stops there."*

### On React
- **Q:** Why `useRef` for `tabHiddenAt` and not `useState`? *→ "Because I don't want a re-render every time a tab-switch timer updates. `useRef` gives me a mutable value that persists across renders without triggering them. `useState` would cause unnecessary re-renders and potentially stale-closure bugs in the event handler."*
- **Q:** What's a useEffect dependency array? *→ "It tells React when to re-run the effect. Empty = once on mount. Missing = every render. With `[sessionId]` the effect re-runs only if `sessionId` changes. I'm careful to include all referenced values or I'd get stale closures."*

### On security fundamentals
- **Q:** What's bcrypt's cost factor? *→ "The work factor — I used 10, meaning 2^10 = 1,024 key-derivation iterations. Each increment doubles the work. 10 takes ~65ms on modern hardware — slow enough to make brute-force painful, fast enough that login feels instant."*
- **Q:** Why bcrypt and not SHA-256? *→ "SHA-256 is a general-purpose hash — fast is a **feature** there. For passwords, fast is a **bug** because it helps brute-force. bcrypt is deliberately slow (CPU + memory), salt-inclusive, and configurable. Alternatives are scrypt, Argon2 — Argon2 is the current best-practice."*
- **Q:** What does `helmet` do? *→ "It sets ~15 security HTTP headers by default — X-Content-Type-Options, X-Frame-Options (clickjacking), HSTS, Referrer-Policy, and a baseline CSP. One line of code prevents an entire class of browser-level attacks."*

### On SQL
- **Q:** What's the difference between INNER and LEFT JOIN? *→ "INNER returns only rows where both sides match. LEFT returns all rows from the left table with NULLs on the right where there's no match. I use LEFT JOIN in the lecturer summary query where I need every student in the course even if they haven't submitted."*
- **Q:** What's an index? *→ "A B-tree data structure maintained alongside the table that speeds up lookups on indexed columns. My primary keys are auto-indexed. `User.email` is UNIQUE so it's also indexed. For the audit log paginated queries I'd add a composite index on `(user_id, timestamp DESC)` in production."*

---

# SECTION E — 90-SECOND DRY-RUN SCRIPT (practise aloud)

Run this out loud **three times** before the interview:

> *"My final-year project is SecureExam UTM. It's a Zero-Trust exam platform I built for Universiti Teknologi Malaysia's Open Distance Learning programme. The problem I wanted to solve is that most online exam systems still trust you after login — if you have a token, you're in. That's a perimeter model. Zero-Trust flips it: never trust, always verify — every single request is re-authenticated.*
>
> *I built it solo with React + Tailwind on the frontend, Node.js with Express on the backend, and MySQL with raw parameterized queries. About 8,100 lines of code. I implemented 25 distinct Zero-Trust controls across five layers — authentication, session management, browser lockdown, role-based authorization, and audit/monitoring.*
>
> *The central piece is a middleware that runs four checks on every protected API request: JWT validity, user existence re-check from the database, client IP binding match, and audit logging. On top of that I have TOTP multi-factor auth with a three-stage JWT state machine — a full token, a 5-minute MFA temp token, and a separate 5-minute resume token for step-up MFA when a student comes back to an in-progress exam. A heartbeat every 60 seconds rotates the JWT while the student is active; a cron job marks sessions abandoned after 3 minutes of silence.*
>
> *What I'm proudest of is that every security control is intentional and fail-closed — there is not one fallback secret, not one string-concatenated SQL query, and not one TODO in 8,100 lines. I think the patterns I learned — short-lived tokens, continuous verification, log-everything — map directly to manufacturing IT security where the perimeter has also dissolved. That's part of why this role at Micron excites me."*

---

# SECTION F — LAST-MILE CHECKLIST

Before you go into Round 2, make sure you can:

- [ ] Explain the 4 Zero-Trust middleware checks without looking at notes.
- [ ] Draw the 6-state session lifecycle on paper.
- [ ] Write out the Fisher-Yates loop from memory.
- [ ] Name all 3 token types (full / temp MFA / resume MFA) and their payloads.
- [ ] Explain `bcrypt.compare` vs. `speakeasy.totp.verify`.
- [ ] Explain why you used raw SQL — 3 reasons minimum.
- [ ] Name 5 OWASP Top 10 items and how you mitigate each.
- [ ] Pronounce "Fisher-Yates", "TOTP", "HMAC-SHA1", and "idempotent" confidently.
- [ ] Have one concrete number ready for each major claim (25 controls, 8,100 LOC, 9 phases, 15-min JWT, 60-sec heartbeat, 3-min abandon threshold, 5 tab-switch flag).

**You've got this. Good luck at Micron.**
