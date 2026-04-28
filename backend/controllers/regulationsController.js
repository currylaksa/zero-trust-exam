exports.getRegulations = (req, res) => {
  return res.status(200).json({
    "lastUpdated": "2026-04-27",
    "version": "1.1",
    "categories": [
      {
        "id": "authentication",
        "title": "Authentication & Identity",
        "icon": "shield",
        "rules": [
          {
            "id": "auth_001",
            "rule": "Multi-Factor Authentication is mandatory for all users",
            "enforcement": "automatic",
            "consequence": "Login is blocked without valid OTP"
          },
          {
            "id": "auth_002", 
            "rule": "Session tokens expire after 15 minutes of inactivity",
            "enforcement": "automatic",
            "consequence": "User is logged out and must re-authenticate"
          },
          {
            "id": "auth_003",
            "rule": "Token is bound to the IP address at login time",
            "enforcement": "automatic",
            "consequence": "Request is rejected with 403 if IP changes"
          },
          {
            "id": "auth_004",
            "rule": "Step-up verification required when resuming an exam",
            "enforcement": "automatic",
            "consequence": "MFA must be completed before re-entering exam"
          }
        ]
      },
      {
        "id": "exam_conduct",
        "title": "Exam Conduct",
        "icon": "clipboard",
        "rules": [
          {
            "id": "exam_001",
            "rule": "Exam must be taken in fullscreen mode at all times",
            "enforcement": "automatic",
            "consequence": "Exit is logged and re-entry to fullscreen is forced"
          },
          {
            "id": "exam_002",
            "rule": "Tab switching or window minimising is prohibited",
            "enforcement": "automatic",
            "consequence": "Each violation is logged. After 5 violations, session is flagged and marks for any answer submitted after the flag are nullified to 0"
          },
          {
            "id": "exam_003",
            "rule": "Copy, paste, and right-click are disabled",
            "enforcement": "automatic",
            "consequence": "Actions are blocked and logged"
          },
          {
            "id": "exam_004",
            "rule": "Browser must send a heartbeat every 60 seconds",
            "enforcement": "automatic",
            "consequence": "Session is auto-submitted after 3 minutes without heartbeat. Lecturer is alerted in the monitoring panel"
          },
          {
            "id": "exam_005",
            "rule": "Exam must be completed within the allocated time window",
            "enforcement": "automatic",
            "consequence": "Exam is auto-submitted when timer reaches zero"
          }
        ]
      },
      {
        "id": "access_control",
        "title": "Access Control",
        "icon": "lock",
        "rules": [
          {
            "id": "access_001",
            "rule": "Students may only access exams for enrolled courses",
            "enforcement": "automatic",
            "consequence": "Unenrolled students receive a 403 error"
          },
          {
            "id": "access_002",
            "rule": "Each user role has strictly defined permissions",
            "enforcement": "automatic",
            "consequence": "Unauthorized role access returns 403"
          },
          {
            "id": "access_003",
            "rule": "Exam answers are only visible to the submitting student and their lecturer",
            "enforcement": "automatic",
            "consequence": "Cross-student result access returns 403"
          }
        ]
      },
      {
        "id": "audit",
        "title": "Audit & Monitoring",
        "icon": "eye",
        "rules": [
          {
            "id": "audit_001",
            "rule": "Every API request is logged to the audit trail",
            "enforcement": "automatic",
            "consequence": "All actions are permanently recorded"
          },
          {
            "id": "audit_002",
            "rule": "Suspicious activities generate lecturer alerts",
            "enforcement": "automatic",
            "consequence": "Lecturer is notified in real time on monitoring panel"
          },
          {
            "id": "audit_003",
            "rule": "Audit logs cannot be deleted by any user role",
            "enforcement": "automatic",
            "consequence": "Logs are append-only and permanently retained"
          }
        ]
      }
    ]
  });
};
