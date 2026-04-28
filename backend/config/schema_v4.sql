-- schema_v4.sql: Phase 9.1 migrations
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS
-- Run this after schema.sql, schema_v2.sql, and schema_v3.sql

USE secure_exam_db;

-- Phase 9.1: Add assigned_lecturer_id to Course
-- This column tracks which lecturer is responsible for the course,
-- separate from created_by (who created the record).
-- NULL allowed for backward compatibility with existing rows.
ALTER TABLE Course
  ADD COLUMN IF NOT EXISTS assigned_lecturer_id INT NULL
  COMMENT 'User ID of the lecturer assigned to teach this course';
