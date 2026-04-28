USE secure_exam_db;

-- Seed 16 MECR courses for UTM ODL Master's Program
-- Safe to re-run: INSERT IGNORE skips duplicates on course_code

INSERT IGNORE INTO Course (course_code, course_name, created_by, assigned_lecturer_id, created_at) VALUES
('MECR0013', 'Cryptography',                                        22, 22, NOW()),
('MECR0023', 'Computer Security',                                   22, 22, NOW()),
('MECR1023', 'Information Security Governance and Risk Management', 22, 22, NOW()),
('MECR1033', 'Digital Forensics',                                   22, 22, NOW()),
('MECR1043', 'Cloud Computing Security',                            22, 22, NOW()),
('MECR1053', 'Secure Software Engineering',                         22, 22, NOW()),
('MECR1063', 'Cryptographic Engineering',                           22, 22, NOW()),
('MECR1073', 'Penetration Testing',                                 22, 22, NOW()),
('MECR1013', 'Research Methodology',                                22, 22, NOW()),
('MECR2113', 'Business Continuity Planning',                        22, 22, NOW()),
('MECR2123', 'Security Audit and Assessment',                       22, 22, NOW()),
('MECR2213', 'Cyber Threat Intelligence',                           22, 22, NOW()),
('MECR2223', 'Security Data Exploration',                           22, 22, NOW()),
('MECR2233', 'Security Data Analytics and Visualization',           22, 22, NOW()),
('MECR2313', 'Software Exploitation',                               22, 22, NOW()),
('MECR2323', 'Malware Analysis',                                    22, 22, NOW());
