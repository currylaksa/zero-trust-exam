// PM2 ecosystem file for SecureExam UTM.
//
// Manages two long-running processes on the same droplet:
//   1. secureexam-api  — the Node + Express backend (port 5001, behind Nginx)
//   2. risk-scorer     — the Python Flask risk-scoring service for control #26
//                        (bound to 127.0.0.1:8001, never proxied)
//
// Both processes are started with absolute paths derived from __dirname so
// the file works regardless of where pm2 is invoked from. Apply with:
//
//     pm2 reload ecosystem.config.js
//     pm2 save
//
// Migration from a hand-started PM2 instance (existing droplet setup):
// see backend/risk-scoring/DEPLOYMENT.md §"Migrating an existing PM2 process".

const path = require('path');

const REPO_ROOT = __dirname;
const RISK_SCORING_DIR = path.join(REPO_ROOT, 'backend', 'risk-scoring');

module.exports = {
  apps: [
    {
      name: 'secureexam-backend',
      cwd: REPO_ROOT,
      script: 'backend/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      // PM2 writes logs to ~/.pm2/logs/<name>-out.log / <name>-error.log
      // by default. Merge stdout + stderr into one stream for easier tailing.
      merge_logs: true,
      time: true,
    },
    {
      name: 'risk-scorer',
      cwd: RISK_SCORING_DIR,
      // Use the venv's python binary as the interpreter so PM2 picks up the
      // correct Flask / scikit-learn / numpy versions installed for this app.
      // venv/ is gitignored — created on the droplet by the deploy runbook.
      interpreter: path.join(RISK_SCORING_DIR, 'venv', 'bin', 'python'),
      script: 'service.py',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        FLASK_ENV: 'production',
        // service.py defaults to 127.0.0.1:8001; these env vars are
        // documented in service.py and can be overridden for local
        // integration testing. They must NOT be changed in production.
        // RISK_SCORER_PORT: '8001',
        // RISK_MODEL_PATH: 'risk_model.pkl',
      },
      merge_logs: true,
      time: true,
    },
  ],
};
