-- schema_v3.sql: Phase 9 migrations
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS
-- Run this after schema.sql and schema_v2.sql

USE secure_exam_db;

-- Phase 9: Add duration_away_seconds to FlaggedActivity
-- This column stores how long a student was away from
-- the exam tab during a TAB_SWITCH event (in seconds).
-- NULL for non-TAB_SWITCH flagged activities.
ALTER TABLE FlaggedActivity
  ADD COLUMN IF NOT EXISTS duration_away_seconds INT NULL
  COMMENT 'Seconds away from exam tab (TAB_SWITCH only)';
