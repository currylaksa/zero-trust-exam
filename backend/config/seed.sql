USE secure_exam_db;

-- Seed data for development/testing
-- Assumes empty tables or a fresh schema; explicit IDs ensure stable FK references.

INSERT INTO User (user_id, username, password, email, role, mfa_secret, mfa_enabled)
VALUES
  (1, 'AdminUser',   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@utm.my',    'admin',    NULL, FALSE),
  (2, 'DrAhmad',     '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'lecturer@utm.my', 'lecturer', NULL, FALSE),
  (3, 'StudentAli',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'student1@utm.my', 'student',  NULL, FALSE),
  (4, 'StudentSiti', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'student2@utm.my', 'student',  NULL, FALSE);

INSERT INTO Student (student_id, user_id, student_matric, enrollment_info)
VALUES
  (1, 3, 'A22EC0001', NULL),
  (2, 4, 'A22EC0002', NULL);

INSERT INTO Exam (exam_id, title, description, duration, created_by, start_time, end_time, status)
VALUES
  (1, 'Network Security Fundamentals', 'Mid-semester exam covering chapters 1 to 5', 60, 2, NULL, NULL, 'published');

INSERT INTO Question (question_id, exam_id, question_text, question_type, options, correct_answer, question_order)
VALUES
  (
    1,
    1,
    'Which OSI layer is primarily responsible for end-to-end reliable delivery (segmentation, acknowledgments, retransmissions)?',
    'mcq',
    JSON_ARRAY('Physical layer', 'Data Link layer', 'Network layer', 'Transport layer'),
    'Transport layer',
    1
  ),
  (
    2,
    1,
    'Which protocol is commonly used to securely access a remote server command line over an encrypted channel?',
    'mcq',
    JSON_ARRAY('Telnet', 'FTP', 'SSH', 'HTTP'),
    'SSH',
    2
  ),
  (
    3,
    1,
    'In public key cryptography, what is the primary purpose of a digital signature?',
    'mcq',
    JSON_ARRAY('Confidentiality of a message', 'Integrity and authenticity of a message', 'Compression of a message', 'Key exchange without certificates'),
    'Integrity and authenticity of a message',
    3
  ),
  (
    4,
    1,
    'Which of the following is the BEST description of a firewall?',
    'mcq',
    JSON_ARRAY('A tool that encrypts all files on a computer', 'A device/software that filters network traffic based on rules', 'A protocol used for DNS resolution', 'A password manager for users'),
    'A device/software that filters network traffic based on rules',
    4
  ),
  (
    5,
    1,
    'Which attack involves tricking users into revealing sensitive information by pretending to be a trustworthy entity?',
    'mcq',
    JSON_ARRAY('Phishing', 'Port scanning', 'Packet fragmentation', 'Load balancing'),
    'Phishing',
    5
  );
