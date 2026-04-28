USE secure_exam_db;

DROP TABLE IF EXISTS FlaggedActivity;
DROP TABLE IF EXISTS ActivityLog;
DROP TABLE IF EXISTS Answer;
DROP TABLE IF EXISTS ExamSession;
DROP TABLE IF EXISTS Question;
DROP TABLE IF EXISTS Exam;
DROP TABLE IF EXISTS Admin;
DROP TABLE IF EXISTS Student;
DROP TABLE IF EXISTS User;

-- Stores all platform users, credentials, roles, and MFA settings.
CREATE TABLE User (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  role ENUM('student', 'lecturer', 'staff', 'admin') NOT NULL,
  mfa_secret VARCHAR(255) NULL,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stores student-specific profile data linked to a user account.
CREATE TABLE Student (
  student_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  student_matric VARCHAR(50),
  enrollment_info VARCHAR(255),
  CONSTRAINT fk_student_user
    FOREIGN KEY (user_id) REFERENCES User(user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Stores admin/staff management records and permission descriptions.
CREATE TABLE Admin (
  admin_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  permissions VARCHAR(255),
  CONSTRAINT fk_admin_user
    FOREIGN KEY (user_id) REFERENCES User(user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Stores exam metadata, timing, status, and creator reference.
CREATE TABLE Exam (
  exam_id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  duration INT NOT NULL,
  created_by INT NOT NULL,
  start_time DATETIME,
  end_time DATETIME,
  status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  course_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exam_creator
    FOREIGN KEY (created_by) REFERENCES User(user_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

-- Stores questions for each exam, including MCQ options and answer key.
CREATE TABLE Question (
  question_id INT PRIMARY KEY AUTO_INCREMENT,
  exam_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('mcq', 'short_answer', 'essay') NOT NULL,
  options JSON NULL,
  correct_answer TEXT NULL,
  question_order INT,
  CONSTRAINT fk_question_exam
    FOREIGN KEY (exam_id) REFERENCES Exam(exam_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Stores each user's exam attempt session and Zero-Trust telemetry.
CREATE TABLE ExamSession (
  session_id INT PRIMARY KEY AUTO_INCREMENT,
  exam_id INT NOT NULL,
  user_id INT NOT NULL,
  start_time DATETIME,
  end_time DATETIME,
  status ENUM('in_progress', 'completed', 'flagged') DEFAULT 'in_progress',
  ip_address VARCHAR(50),
  device_info TEXT,
  tab_switch_count INT DEFAULT 0,
  fullscreen_exit_count INT DEFAULT 0,
  CONSTRAINT fk_session_exam
    FOREIGN KEY (exam_id) REFERENCES Exam(exam_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_session_user
    FOREIGN KEY (user_id) REFERENCES User(user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Stores submitted answers and scoring per question in an exam session.
CREATE TABLE Answer (
  answer_id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NOT NULL,
  question_id INT NOT NULL,
  answer_text TEXT,
  score FLOAT DEFAULT 0,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_answer_session
    FOREIGN KEY (session_id) REFERENCES ExamSession(session_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_answer_question
    FOREIGN KEY (question_id) REFERENCES Question(question_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Stores auditable user and session activities for Zero-Trust monitoring.
CREATE TABLE ActivityLog (
  log_id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NULL,
  user_id INT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  activity_type VARCHAR(100),
  description TEXT,
  CONSTRAINT fk_log_session
    FOREIGN KEY (session_id) REFERENCES ExamSession(session_id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_log_user
    FOREIGN KEY (user_id) REFERENCES User(user_id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

-- Stores suspicious or policy-violating events derived from activity logs.
CREATE TABLE FlaggedActivity (
  flag_id INT PRIMARY KEY AUTO_INCREMENT,
  log_id INT NOT NULL,
  session_id INT NOT NULL,
  flag_reason VARCHAR(255),
  severity ENUM('low', 'medium', 'high') DEFAULT 'medium',
  flagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed BOOLEAN DEFAULT FALSE,
  CONSTRAINT fk_flag_log
    FOREIGN KEY (log_id) REFERENCES ActivityLog(log_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_flag_session
    FOREIGN KEY (session_id) REFERENCES ExamSession(session_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);
