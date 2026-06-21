# SecureExam UTM

A **Zero-Trust online examination platform** with AI-driven behavioral anomaly
detection. Built for the **DIGITEX 2026** competition (Faculty of Computing,
Universiti Teknologi Malaysia) as a Grand Finalist.

🌐 **Live:** [secureexam-cqy.tech](https://secureexam-cqy.tech) · 🎬 **Demo:** [1-min video](https://youtu.be/nyrsI8Op4BY)

---

## Overview

SecureExam UTM secures remote and on-campus exams under a **zero-trust** model:
every request is authenticated, authorized, and continuously verified — no
session is trusted by default. On top of 25 zero-trust controls, the platform's
headline feature (**Control #26**) is a live **behavioral risk-scoring** engine
that flags anomalous exam sessions in real time for human invigilators.

All risk scores are **advisory**. The model takes no autonomous action against
any student — lecturers and invigilators make every enforcement decision.

## Key features

- **Zero-trust middleware** — JWT auth with IP pinning behind an Nginx reverse
  proxy; continuous session verification.
- **Multi-factor authentication** — TOTP-based MFA (QR enrollment via
  `speakeasy` + `qrcode`).
- **Role-based access** — `student`, `lecturer`, `admin`, and `staff` roles,
  each with a dedicated dashboard.
- **Locked-down exam room** — fullscreen enforcement, tab-switch tracking,
  heartbeat telemetry, and session resume verification.
- **Live invigilator monitoring** — active-session dashboard, alerts, and
  per-session risk history.
- **Behavioral risk scoring (Control #26)** — an Isolation Forest model scores
  each active session every 30s on five behavioral features and surfaces
  anomalies to invigilators.
- **Audit logging** — security-relevant events recorded and reviewable.
- **Public landing page** — animated AI risk-monitor demo at `/`.

## Architecture

```
┌─────────────────────┐      ┌──────────────────────────┐      ┌──────────────┐
│  React 19 + Vite     │ HTTPS │  Node / Express 5 API     │      │  MySQL 8      │
│  Tailwind v4         │──────▶│  zero-trust middleware    │─────▶│  exam data    │
│  (frontend/)         │      │  40 REST endpoints        │      │              │
└─────────────────────┘      │  node-cron risk scorer    │      └──────────────┘
                             └─────────────┬─────────────┘
                                           │ 127.0.0.1:8001 (loopback only)
                                           ▼
                             ┌──────────────────────────┐
                             │  Python Flask sidecar      │
                             │  Isolation Forest model    │
                             │  (backend/risk-scoring/)   │
                             └──────────────────────────┘
```

**Stack**

| Layer    | Technology |
|----------|------------|
| Frontend | React 19, Vite, React Router 7, Tailwind CSS v4 |
| Backend  | Node.js, Express 5, JWT, bcryptjs, helmet, express-rate-limit, node-cron |
| Database | MySQL 8 (`mysql2`) |
| Auth/MFA | `jsonwebtoken`, `speakeasy` (TOTP), `qrcode` |
| Risk ML  | Python, Flask, scikit-learn (Isolation Forest) |
| Ops      | PM2, Nginx, DigitalOcean droplet |

## Repository structure

```
backend/
  config/            # DB connection + schema.sql … schema_v5.sql migrations, seeds
  controllers/       # auth, users, admin, exams, sessions, monitoring, courses,
                     #   regulations, riskScore
  routes/            # Express routers mounted under /api/*
  middleware/        # zeroTrust.js (JWT + IP pinning + role checks)
  jobs/              # sessionSweeper, riskScorer (30s cron)
  risk-scoring/      # Python Flask sidecar: service.py, train.py, README.md, DEPLOYMENT.md
frontend/
  src/pages/         # LandingPage, Login, dashboards, ExamRoom, MonitoringPanel, …
  src/components/    # ui.jsx primitives, RoleNavbar
  src/index.css      # Tailwind v4 @theme tokens (UTM maroon brand)
ecosystem.config.js  # PM2 process definitions (API + risk-scorer)
```

## API surface

REST endpoints mounted under `/api`:

| Base                | Purpose |
|---------------------|---------|
| `/api/auth`         | Login, MFA setup/verify |
| `/api/users`        | User management |
| `/api/admin`        | Admin operations |
| `/api/exams`        | Exam CRUD, grading |
| `/api/sessions`     | Exam session lifecycle |
| `/api/monitoring`   | Active sessions, alerts, audit logs, per-session risk history |
| `/api/courses`      | Course data |
| `/api/regulations`  | Exam regulations |
| `/api/health`       | Liveness probe |

## Getting started

### Prerequisites

- Node.js 18+ and npm
- MySQL 8
- Python 3.10+ (for the risk-scoring service)

### 1. Database

```bash
mysql -u root -p < backend/config/schema.sql
# then apply migrations in order: schema_v2.sql … schema_v5.sql
mysql -u root -p secure_exam_db < backend/config/seed.sql   # optional demo data
```

### 2. Backend API

```bash
cd backend
npm install
cp .env.example .env        # set DB creds, JWT secret, FRONTEND_URL
node server.js              # listens on PORT (default 5001)
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # Vite dev server on http://localhost:5173
```

### 4. Risk-scoring service (optional locally)

```bash
cd backend/risk-scoring
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python train.py             # produces risk_model.pkl (synthetic data only)
python service.py           # Flask on 127.0.0.1:8001
```

See [`backend/risk-scoring/README.md`](backend/risk-scoring/README.md) for the
scoring formula, thresholds, and feature definitions.

## Behavioral risk scoring (Control #26)

A localhost-only Flask sidecar scores active sessions using an **Isolation
Forest** trained **exclusively on synthetic data** — real student data is never
used for training. The Node backend's `riskScorer` cron extracts five behavioral
features per active session every 30 seconds and posts them to the model:

`tab_switches` · `total_tab_duration_sec` · `mfa_reprompts` · `heartbeat_count` · `session_resumes`

Scores are written to `SessionRiskScore` and surfaced to invigilators as
**advisory** signals only.

## Deployment

Production runs on a DigitalOcean droplet behind Nginx, with both the Node API
and the Python risk-scorer managed by PM2 (`ecosystem.config.js`). The full
production runbook — DB migration, sidecar setup, PM2 migration, and smoke
tests — is in
[`backend/risk-scoring/DEPLOYMENT.md`](backend/risk-scoring/DEPLOYMENT.md).

## Credits

- **Developer:** Chan Qing Yee
- **Supervisor:** Prof. Madya Ts. Dr. Siti Hajar Binti Othman
- **Institution:** Faculty of Computing, Universiti Teknologi Malaysia (UTM)
- **Competition:** DIGITEX 2026 Grand Finalist
