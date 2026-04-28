-- schema_v2.sql: Phase 8 migrations
-- Safe to re-run: ALTER TABLE statements are
-- commented out if already applied manually

USE secure_exam_db;

-- ====================================================
-- PHASE 8.1 - ADD NEW TABLES
-- ====================================================

-- Course Table: Represents a class or module that exams belong to
CREATE TABLE IF NOT EXISTS Course (
    course_id INT AUTO_INCREMENT PRIMARY KEY,
    course_code VARCHAR(20) NOT NULL UNIQUE,
    course_name VARCHAR(200) NOT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES User(user_id)
);

-- CourseEnrollment Table: Maps users (students) to courses they interact with
CREATE TABLE IF NOT EXISTS CourseEnrollment (
    enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT,
    user_id INT,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    enrolled_by INT,
    UNIQUE (course_id, user_id),
    FOREIGN KEY (course_id) REFERENCES Course(course_id),
    FOREIGN KEY (user_id) REFERENCES User(user_id),
    FOREIGN KEY (enrolled_by) REFERENCES User(user_id)
);

-- ====================================================
-- PHASE 8.1 - MODIFY EXISTING TABLES
-- ====================================================

-- Note: These run fine the first time. Since your first run succeeded on these lines before erroring 
-- on the INSERT statements below, these columns are already in your tables.
-- Commenting them out so you can successfully run the rest of the file.

-- Add course_id to Exam table (nullable for backward compatibility)
-- ALTER TABLE Exam
-- ADD COLUMN course_id INT NULL,
-- ADD CONSTRAINT fk_exam_course FOREIGN KEY (course_id) REFERENCES Course(course_id);

-- Add marks to Question table
-- ALTER TABLE Question
-- ADD COLUMN marks INT NOT NULL DEFAULT 1;

-- ====================================================
-- PHASE 8.1 - SEED DATA
-- ====================================================

-- Courses seed data
-- course 1: SECS4234 by first lecturer
-- course 2: SECS3234 by first lecturer
INSERT IGNORE INTO Course (course_code, course_name, created_by)
VALUES 
    ('SECS4234', 'Network Security', (SELECT user_id FROM User WHERE role = 'lecturer' LIMIT 1)),
    ('SECS3234', 'Cryptography Fundamentals', (SELECT user_id FROM User WHERE role = 'lecturer' LIMIT 1));

-- CourseEnrollment seed data
-- enroll students dynamically based on role if specific IDs are not guaranteed
INSERT IGNORE INTO CourseEnrollment (course_id, user_id, enrolled_by)
SELECT (SELECT course_id FROM Course WHERE course_code = 'SECS4234' LIMIT 1), u.user_id, (SELECT user_id FROM User WHERE role = 'admin' LIMIT 1)
FROM User u WHERE u.role = 'student' LIMIT 2;

INSERT IGNORE INTO CourseEnrollment (course_id, user_id, enrolled_by)
SELECT (SELECT course_id FROM Course WHERE course_code = 'SECS3234' LIMIT 1), u.user_id, (SELECT user_id FROM User WHERE role = 'admin' LIMIT 1)
FROM User u WHERE u.role = 'student' LIMIT 1;

-- Update existing exam data to associate it with course 1
UPDATE IGNORE Exam
SET course_id = (SELECT course_id FROM Course WHERE course_code = 'SECS4234' LIMIT 1)
WHERE exam_id = 1;