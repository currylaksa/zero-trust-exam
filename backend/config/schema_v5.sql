-- schema_v5.sql: Phase 10 migrations — Behavioral Risk Scoring (Control #26)
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS
-- and a stored-procedure idempotency wrapper around the composite index.
-- Run this after schema.sql, schema_v2.sql, schema_v3.sql, and schema_v4.sql
--
-- Apply on droplet:
--   mysql -u <user> -p secure_exam_db < backend/config/schema_v5.sql
--
-- This migration introduces three changes:
--   (1) Retrofit ExamSession.last_heartbeat into canonical schema. The
--       column was originally added via backend/update_db_step2.js and
--       was never reflected in any schema_*.sql file, breaking fresh-DB
--       deploys (the sessionSweeper query depends on it).
--   (2) Create SessionRiskScore — one row per scoring tick from the
--       riskScorer cron (stage 3).
--   (3) Add a composite index on ExamSession(status, last_heartbeat) to
--       cover both the new riskScorer scan and the existing sessionSweeper.

USE secure_exam_db;

-- ====================================================
-- 1. Retrofit ExamSession.last_heartbeat
-- ====================================================
ALTER TABLE ExamSession
  ADD COLUMN IF NOT EXISTS last_heartbeat DATETIME NULL
  COMMENT 'Last heartbeat timestamp; updated by sessionController.heartbeat. Originally added via update_db_step2.js (now obsolete).';

-- ====================================================
-- 2. SessionRiskScore — control #26 output table
-- One row per scoring tick (~30s cadence). Stores the score, level,
-- contributing factors emitted by the Python service, and the feature
-- snapshot that produced the score (for audit/replay).
-- ====================================================
CREATE TABLE IF NOT EXISTS SessionRiskScore (
  score_id             INT AUTO_INCREMENT PRIMARY KEY,
  session_id           INT NOT NULL,
  risk_score           TINYINT UNSIGNED NOT NULL,                  -- 0..100
  risk_level           ENUM('low','medium','high') NOT NULL,
  contributing_factors JSON NULL,
  features_snapshot    JSON NULL,
  scored_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_score_session
    FOREIGN KEY (session_id) REFERENCES ExamSession(session_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX idx_score_session_time (session_id, scored_at DESC),       -- "latest score per session"
  INDEX idx_score_level_time   (risk_level, scored_at DESC)        -- "all high-risk in last 5 min"
);

-- ====================================================
-- 3. Composite index on ExamSession(status, last_heartbeat)
-- Covers the riskScorer's active-sessions scan and the existing
-- sessionSweeper's heartbeat-timeout scan. Wrapped in a stored procedure
-- so this works on MySQL 8.0.x patch levels older than 8.0.16
-- (CREATE INDEX IF NOT EXISTS was added in 8.0.16).
-- ====================================================
DROP PROCEDURE IF EXISTS _add_idx_session_status_heartbeat;
DELIMITER $$
CREATE PROCEDURE _add_idx_session_status_heartbeat()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'ExamSession'
      AND INDEX_NAME   = 'idx_session_status_heartbeat'
  ) THEN
    ALTER TABLE ExamSession
      ADD INDEX idx_session_status_heartbeat (status, last_heartbeat);
  END IF;
END$$
DELIMITER ;
CALL _add_idx_session_status_heartbeat();
DROP PROCEDURE _add_idx_session_status_heartbeat;
