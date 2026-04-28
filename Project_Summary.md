# SecureExam UTM — Project Summary

---

### 1. PROJECT OVERVIEW

- **Project Name:** SecureExam UTM (Zero-Trust Exam Platform)
- **Purpose:** A secure online examination platform built for Universiti Teknologi Malaysia (UTM) that enforces Zero-Trust security principles — including strict identity verification, continuous session validation, suspicious behaviour logging, role-based access control, and real-time monitoring — across the entire exam lifecycle.

- **Tech Stack:**

  | Layer | Technology | Version |
  |-------|-----------|---------|
  | Backend Runtime | Node.js | CommonJS |
  | Backend Framework | Express | ^5.2.1 |
  | Database Driver | mysql2 | ^3.20.0 |
  | Authentication | jsonwebtoken | ^9.0.3 |
  | Password Hashing | bcryptjs | ^3.0.3 |
  | MFA (TOTP) | speakeasy | ^2.0.0 |
  | QR Code Generation | qrcode | ^1.5.4 |
  | Rate Limiting | express-rate-limit | ^8.3.1 |
  | Security Headers | helmet | ^8.1.0 |
  | CORS | cors | ^2.8.6 |
  | Environment Variables | dotenv | ^17.3.1 |
  | Cron Jobs | node-cron | ^4.2.1 |
  | Email | nodemailer | ^8.0.4 |
  | HTTP Client (backend) | axios | ^1.14.0 |
  | Frontend Framework | React | ^19.2.4 |
  | Frontend DOM | react-dom | ^19.2.4 |
  | Routing | react-router-dom | ^7.13.2 |
  | HTTP Client (frontend) | axios | ^1.13.6 |
  | Build Tool | Vite | ^8.0.1 |
  | CSS Framework | Tailwind CSS | ^4.2.2 |
  | Tailwind Vite Plugin | @tailwindcss/vite | ^4.2.2 |
  | React Vite Plugin | @vitejs/plugin-react | ^6.0.1 |
  | Linting | ESLint | ^9.39.4 |

- **Port Numbers:**
  - Backend API server: **5001** (configurable via `PORT` env var)
  - Frontend Vite dev server: **5173** (Vite default)

- **Current Development Status:** All phases completed (Phase 1 through Phase 9), plus additional hotfixes (JWT fix, template literal fix, flagged status fix, JWT_EXPIRES_IN fix, migration fix).

- **Overall Completion Percentage:** **100%**

---

### 2. BACKEND SUMMARY

#### 2.1 Config Files

##### `backend/config/db.js`
Creates and exports a mysql2 connection pool using environment variables (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) with a connection limit of 10.

- **Exports:** `pool` (mysql2 promise pool)

##### `backend/config/schema.sql`
The base database schema (Phase 2) that creates all core tables: `User`, `Student`, `Admin`, `Exam`, `Question`, `ExamSession`, `Answer`, `ActivityLog`, `FlaggedActivity`.

##### `backend/config/schema_v2.sql`
Phase 8 migrations that add the `Course` and `CourseEnrollment` tables, add `course_id` to `Exam`, add `marks` to `Question`, and seed initial course data.

##### `backend/config/schema_v3.sql`
Phase 9 migration that adds `duration_away_seconds` (INT NULL) to `FlaggedActivity` for tracking how long a student was away during a TAB_SWITCH event.

##### `backend/config/schema_v4.sql`
Phase 9.1 migration that adds `assigned_lecturer_id` (INT NULL) to `Course` to track which lecturer is responsible for teaching a course.

##### `backend/config/seed.sql`
Initial seed data for users, exams, and questions.

##### `backend/config/seed_courses.sql`
Seed data for courses and course enrollments.

---

#### 2.2 Route Files

##### `backend/routes/auth.js`
Handles authentication routes.

| Method | Path | Auth Required | Allowed Roles | Handler |
|--------|------|---------------|---------------|---------|
| POST | `/api/auth/register` | No | All | `register` |
| POST | `/api/auth/login` | No | All | `login` |
| POST | `/api/auth/verify-mfa` | No | All | `verifyMFA` |
| POST | `/api/auth/setup-mfa` | Yes | All authenticated | `setupMFA` |
| POST | `/api/auth/refresh` | Yes | All authenticated | `refreshToken` |

##### `backend/routes/admin.js`
Handles admin-only routes.

| Method | Path | Auth Required | Allowed Roles | Handler |
|--------|------|---------------|---------------|---------|
| GET | `/api/admin/stats` | Yes | admin | `adminController.getStats` |

##### `backend/routes/users.js`
Handles user management routes (all routes require authentication via `verifyZeroTrust` middleware applied at router level).

| Method | Path | Auth Required | Allowed Roles | Handler |
|--------|------|---------------|---------------|---------|
| GET | `/api/users` | Yes | admin, staff | `userController.getUsers` |
| POST | `/api/users` | Yes | admin | `userController.createUser` |
| PUT | `/api/users/:id` | Yes | admin | `userController.updateUserRole` |
| DELETE | `/api/users/:id` | Yes | admin | `userController.deleteUser` |

##### `backend/routes/exams.js`
Handles exam CRUD and question management routes.

| Method | Path | Auth Required | Allowed Roles | Handler |
|--------|------|---------------|---------------|---------|
| POST | `/api/exams` | Yes | lecturer, admin | `createExam` |
| GET | `/api/exams` | Yes | All authenticated | `getAllExams` |
| GET | `/api/exams/:id` | Yes | All authenticated | `getExamById` |
| PUT | `/api/exams/:id` | Yes | lecturer, admin | `updateExam` |
| DELETE | `/api/exams/:id` | Yes | lecturer, admin | `deleteExam` |
| POST | `/api/exams/:id/questions` | Yes | lecturer, admin | `addQuestion` |
| GET | `/api/exams/:id/questions` | Yes | All authenticated | `getQuestions` |
| DELETE | `/api/exams/questions/:questionId` | Yes | lecturer, admin | `deleteQuestion` |

##### `backend/routes/sessions.js`
Handles exam session workflow routes.

| Method | Path | Auth Required | Allowed Roles | Handler |
|--------|------|---------------|---------------|---------|
| GET | `/api/sessions/my-sessions` | Yes | student | `getMySessions` |
| POST | `/api/sessions/start/:examId` | Yes | student | `startSession` |
| POST | `/api/sessions/:id/initiate-resume` | Yes | student | `initiateResume` |
| POST | `/api/sessions/verify-resume` | No (uses resumeToken) | N/A | `verifyResume` |
| GET | `/api/sessions/:id/questions` | Yes | student | `getSessionQuestions` |
| POST | `/api/sessions/:id/answer` | Yes | student | `saveAnswer` |
| POST | `/api/sessions/:id/submit` | Yes | student | `submitExam` |
| POST | `/api/sessions/:id/heartbeat` | Yes | student | `heartbeat` |
| POST | `/api/sessions/:id/log` | Yes | student | `logSuspiciousActivity` |
| GET | `/api/sessions/:id/results` | Yes | All authenticated | `getSessionResults` |
| GET | `/api/sessions/exam/:examId/submissions` | Yes | lecturer, admin | `getExamSubmissions` |
| PUT | `/api/sessions/:sessionId/answers/:answerId/grade` | Yes | lecturer, admin | `gradeAnswer` |

##### `backend/routes/monitoring.js`
Handles real-time monitoring and audit log routes.

| Method | Path | Auth Required | Allowed Roles | Handler |
|--------|------|---------------|---------------|---------|
| GET | `/api/monitoring/sessions` | Yes | lecturer, admin | `getActiveSessions` |
| GET | `/api/monitoring/alerts` | Yes | lecturer, admin | `getAlerts` |
| GET | `/api/monitoring/audit-logs` | Yes | lecturer, admin | `getAuditLogs` |
| PUT | `/api/monitoring/alerts/:id/review` | Yes | lecturer, admin | `markAlertReviewed` |

##### `backend/routes/courses.js`
Handles course and enrollment management routes (all routes require authentication via `verifyZeroTrust` middleware applied at router level).

| Method | Path | Auth Required | Allowed Roles | Handler |
|--------|------|---------------|---------------|---------|
| GET | `/api/courses` | Yes | All authenticated | `courseController.getAllCourses` |
| POST | `/api/courses` | Yes | staff, lecturer, admin | `courseController.createCourse` |
| GET | `/api/courses/:id/students` | Yes | staff, admin, lecturer | `courseController.getCourseStudents` |
| POST | `/api/courses/:id/enroll` | Yes | staff, admin | `courseController.enrollStudent` |
| DELETE | `/api/courses/:id/students/:userId` | Yes | staff, admin | `courseController.removeStudent` |

##### `backend/routes/regulations.js`
Serves the zero-trust regulations data.

| Method | Path | Auth Required | Allowed Roles | Handler |
|--------|------|---------------|---------------|---------|
| GET | `/api/regulations` | No | All | `regulationsController.getRegulations` |

---

#### 2.3 Controller Files

##### `backend/controllers/authController.js`
Handles user registration, login (with MFA detection), MFA setup via TOTP QR code, MFA OTP verification, and JWT token refresh.

| Function | Method | Path | Auth Required | Allowed Roles |
|----------|--------|------|---------------|---------------|
| `register` | POST | `/api/auth/register` | No | All |
| `login` | POST | `/api/auth/login` | No | All |
| `setupMFA` | POST | `/api/auth/setup-mfa` | Yes | All authenticated |
| `verifyMFA` | POST | `/api/auth/verify-mfa` | No (uses tempToken) | N/A |
| `refreshToken` | POST | `/api/auth/refresh` | Yes | All authenticated |

##### `backend/controllers/adminController.js`
Provides system-wide statistics for the admin dashboard.

| Function | Method | Path | Auth Required | Allowed Roles |
|----------|--------|------|---------------|---------------|
| `getStats` | GET | `/api/admin/stats` | Yes | admin |

##### `backend/controllers/userController.js`
Handles CRUD operations for user accounts including search, creation (with welcome email), role updates, and deletion (with manual cascade for foreign key constraints).

| Function | Method | Path | Auth Required | Allowed Roles |
|----------|--------|------|---------------|---------------|
| `getUsers` | GET | `/api/users` | Yes | admin, staff |
| `createUser` | POST | `/api/users` | Yes | admin |
| `updateUserRole` | PUT | `/api/users/:id` | Yes | admin |
| `deleteUser` | DELETE | `/api/users/:id` | Yes | admin |

##### `backend/controllers/examController.js`
Handles full exam lifecycle — create, read, update, delete exams and questions. Enforces course ownership for lecturers. Sends email notifications when an exam is published.

| Function | Method | Path | Auth Required | Allowed Roles |
|----------|--------|------|---------------|---------------|
| `createExam` | POST | `/api/exams` | Yes | lecturer, admin |
| `getAllExams` | GET | `/api/exams` | Yes | All authenticated (filtered by role) |
| `getExamById` | GET | `/api/exams/:id` | Yes | All authenticated (filtered by role) |
| `updateExam` | PUT | `/api/exams/:id` | Yes | lecturer, admin |
| `deleteExam` | DELETE | `/api/exams/:id` | Yes | lecturer, admin |
| `addQuestion` | POST | `/api/exams/:id/questions` | Yes | lecturer, admin |
| `getQuestions` | GET | `/api/exams/:id/questions` | Yes | All authenticated |
| `deleteQuestion` | DELETE | `/api/exams/questions/:questionId` | Yes | lecturer, admin |

##### `backend/controllers/sessionController.js`
Handles the entire exam-taking workflow — starting sessions, retrieving questions (with Fisher-Yates shuffle), saving answers (upsert), auto-grading MCQs on submission, heartbeat with token refresh, suspicious activity logging (tab switches, fullscreen exits), session flagging at threshold, exam resume with step-up MFA, grading answers, and results retrieval. Sends email notifications on exam start, submission, and session flagging.

| Function | Method | Path | Auth Required | Allowed Roles |
|----------|--------|------|---------------|---------------|
| `startSession` | POST | `/api/sessions/start/:examId` | Yes | student |
| `getSessionQuestions` | GET | `/api/sessions/:id/questions` | Yes | student |
| `saveAnswer` | POST | `/api/sessions/:id/answer` | Yes | student |
| `submitExam` | POST | `/api/sessions/:id/submit` | Yes | student |
| `heartbeat` | POST | `/api/sessions/:id/heartbeat` | Yes | student |
| `logSuspiciousActivity` | POST | `/api/sessions/:id/log` | Yes | student |
| `getMySessions` | GET | `/api/sessions/my-sessions` | Yes | student |
| `getSessionResults` | GET | `/api/sessions/:id/results` | Yes | All authenticated |
| `getExamSubmissions` | GET | `/api/sessions/exam/:examId/submissions` | Yes | lecturer, admin |
| `gradeAnswer` | PUT | `/api/sessions/:sessionId/answers/:answerId/grade` | Yes | lecturer, admin |
| `initiateResume` | POST | `/api/sessions/:id/initiate-resume` | Yes | student |
| `verifyResume` | POST | `/api/sessions/verify-resume` | No (uses resumeToken) | N/A |

##### `backend/controllers/monitoringController.js`
Provides live session monitoring, unreviewed alert listing, paginated audit log retrieval with filters, and alert review marking. Lecturers are scoped to their own exams; admins see all.

| Function | Method | Path | Auth Required | Allowed Roles |
|----------|--------|------|---------------|---------------|
| `getActiveSessions` | GET | `/api/monitoring/sessions` | Yes | lecturer, admin |
| `getAlerts` | GET | `/api/monitoring/alerts` | Yes | lecturer, admin |
| `getAuditLogs` | GET | `/api/monitoring/audit-logs` | Yes | lecturer, admin |
| `markAlertReviewed` | PUT | `/api/monitoring/alerts/:id/review` | Yes | lecturer, admin |

##### `backend/controllers/courseController.js`
Handles course CRUD and student enrollment management. Role-scoped queries: lecturers see only their assigned courses, students see only enrolled courses, admins/staff see all.

| Function | Method | Path | Auth Required | Allowed Roles |
|----------|--------|------|---------------|---------------|
| `getAllCourses` | GET | `/api/courses` | Yes | All authenticated |
| `createCourse` | POST | `/api/courses` | Yes | staff, lecturer, admin |
| `getCourseStudents` | GET | `/api/courses/:id/students` | Yes | staff, admin, lecturer |
| `enrollStudent` | POST | `/api/courses/:id/enroll` | Yes | staff, admin |
| `removeStudent` | DELETE | `/api/courses/:id/students/:userId` | Yes | staff, admin |

##### `backend/controllers/regulationsController.js`
Returns a static JSON payload describing all Zero-Trust security regulations, organized by category (Authentication & Identity, Exam Conduct, Access Control, Audit & Monitoring).

| Function | Method | Path | Auth Required | Allowed Roles |
|----------|--------|------|---------------|---------------|
| `getRegulations` | GET | `/api/regulations` | No | All |

---

#### 2.4 Middleware Files

##### `backend/middleware/zeroTrust.js`
The core Zero-Trust enforcement middleware. Every protected API request passes through this.

- **`verifyZeroTrust`** — Extracts and verifies JWT from the `Authorization: Bearer <token>` header. Checks that the token is not expired, that the user still exists in the database, that the client IP matches the IP bound to the JWT at login time (logs `IP_MISMATCH` and returns 403 on mismatch), attaches the full user record to `req.user`, and logs every API access to the `ActivityLog` table. Fails closed — returns 500 if `JWT_SECRET` is not set.
- **`requireRole(...roles)`** — RBAC middleware generator that checks `req.user.role` against one or more allowed roles. Returns 403 if the user's role is not in the allowed list.

---

#### 2.5 Jobs Files

##### `backend/jobs/sessionSweeper.js`
A cron job that runs every 5 minutes (and once immediately on server start) to detect abandoned exam sessions. Queries for `ExamSession` records with `status = 'in_progress'` where `last_heartbeat` is more than 3 minutes ago, marks them as `'abandoned'`, inserts an `ActivityLog` entry with type `SESSION_ABANDONED`, and creates a `FlaggedActivity` entry with severity `'high'`.

- **Exports:** `startSessionSweeper` (function)

---

#### 2.6 Services Files

##### `backend/services/emailService.js`
Provides non-fatal email notification functions using Nodemailer with Gmail SMTP. All errors are caught and logged to console — email failures never propagate to API responses.

- **`sendExamStartedEmail({ lecturerEmail, lecturerName, studentName, examTitle, startTime, sessionId })`** — Notifies the lecturer when a student starts an exam.
- **`sendExamSubmittedEmail({ studentEmail, studentName, examTitle, submitTime, sessionId, score, totalMarks })`** — Sends submission confirmation with provisional score to the student.
- **`sendExamSubmittedLecturerEmail({ lecturerEmail, lecturerName, studentName, examTitle, submitTime, sessionId })`** — Notifies the lecturer when a student submits.
- **`sendSessionFlaggedEmail({ lecturerEmail, lecturerName, studentName, examTitle, flagReason, tabSwitchCount, sessionId })`** — Alerts the lecturer when a session is flagged for suspicious activity.
- **`sendWelcomeEmail({ studentEmail, studentName, role })`** — Sends a welcome email when a new user account is created by an admin.
- **`sendExamPublishedEmail({ studentEmail, studentName, examTitle, courseName, startTime, endTime, duration })`** — Notifies enrolled students when an exam is published.

---

### 3. FRONTEND SUMMARY

#### 3.1 Pages

##### `frontend/src/pages/Login.jsx`
Login page that handles email/password authentication, MFA detection, and password visibility toggle.

- **State variables:** `email` (useState), `password` (useState), `showPassword` (useState), `error` (useState), `loading` (useState)
- **API calls:** `POST /auth/login`
- **Navigates to:** `/verify-mfa` (if MFA required), `/dashboard` (on successful login), `/regulations` (link)

##### `frontend/src/pages/MFAVerify.jsx`
MFA verification page shown after login when MFA is enabled. Accepts a 6-digit OTP code.

- **State variables:** `otp` (useState), `loading` (useState), `error` (useState), `inputRef` (useRef)
- **API calls:** `POST /auth/verify-mfa`
- **Navigates to:** `/login` (if no temp token or back link), `/dashboard` (on successful verification)

##### `frontend/src/pages/MFASetup.jsx`
First-time MFA setup page that displays a TOTP QR code and accepts a verification code to confirm setup.

- **State variables:** `qrCode` (useState), `otp` (useState), `error` (useState), `isLoading` (useState), `isSuccess` (useState), `isVerifying` (useState), `fetchedRef` (useRef)
- **API calls:** `POST /auth/setup-mfa`, `POST /auth/verify-mfa`
- **Navigates to:** `/dashboard` (on success)

##### `frontend/src/pages/Dashboard.jsx`
Role-based redirect hub. Checks the user's role and redirects to the appropriate role-specific dashboard.

- **State variables:** None
- **API calls:** None
- **Navigates to:** `/student/dashboard`, `/lecturer/dashboard`, `/staff/dashboard`, `/admin/dashboard`, or `/login`

##### `frontend/src/pages/StudentDashboard.jsx`
Student's main dashboard showing available, in-progress, completed, flagged, and abandoned exams with metric cards. Includes a regulations confirmation modal before starting an exam and step-up MFA for resuming.

- **State variables:** `exams` (useState), `sessions` (useState), `loading` (useState), `error` (useState), `showRegulationsModal` (useState), `selectedExamId` (useState), `starting` (useState)
- **API calls:** `GET /exams`, `GET /sessions/my-sessions`, `POST /sessions/start/:examId`, `POST /sessions/:id/initiate-resume`
- **Navigates to:** `/exam/:sessionId` (start/continue exam), `/resume-verify` (if MFA required for resume), `/results/:sessionId` (view results), `/regulations`

##### `frontend/src/pages/ExamRoom.jsx`
The secure exam-taking environment with fullscreen enforcement, tab switch detection, copy/paste/right-click prevention, countdown timer, heartbeat with token refresh, question navigation sidebar, auto-save answers with debounce, and submit confirmation modal.

- **State variables:** `sessionData` (useState), `questions` (useState), `currentIndex` (useState), `answers` (useState), `timeLeft` (useState), `warning` (useState), `loading` (useState), `submitting` (useState), `showSubmitModal` (useState), `heartbeatInteralRef` (useRef), `timerIntervalRef` (useRef), `debounceTimerRef` (useRef), `tabHiddenAt` (useRef), `lastFullscreenExitAt` (useRef)
- **API calls:** `GET /sessions/:sessionId/questions`, `POST /sessions/:sessionId/answer`, `POST /sessions/:sessionId/submit`, `POST /sessions/:sessionId/heartbeat`, `POST /sessions/:sessionId/log`
- **Navigates to:** `/results/:sessionId` (after submit), `/dashboard` (on error), `/login` (on token expiry)

##### `frontend/src/pages/Results.jsx`
Displays exam results including score (provisional or final), questions answered, time taken, flagged activity warnings, and a full question-by-question review with correct/incorrect MCQ highlighting, nullified score indicators, and grading status for subjective questions.

- **State variables:** `data` (useState), `loading` (useState), `error` (useState)
- **API calls:** `GET /sessions/:sessionId/results`
- **Navigates to:** `/dashboard`, `/student/dashboard`, `/regulations`

##### `frontend/src/pages/LecturerDashboard.jsx`
Lecturer's main dashboard showing a table of all exams they created with status badges, and action buttons for Summary, Grade, Edit, and Delete.

- **State variables:** `exams` (useState), `loading` (useState), `error` (useState)
- **API calls:** `GET /exams`, `DELETE /exams/:examId`
- **Navigates to:** `/manage/exams/new`, `/manage/exams/:id`, `/manage/exams/:examId/summary`, `/manage/grading/:examId`, `/manage/monitoring`, `/manage/audit-logs`, `/regulations`

##### `frontend/src/pages/ExamBuilder.jsx`
Create or edit an exam with settings (title, description, duration, start/end time, course, status) and a question builder supporting MCQ, short answer, and essay types with configurable marks.

- **State variables:** `loading` (useState), `error` (useState), `success` (useState), `saving` (useState), `exam` (useState — object with title, description, duration, start_time, end_time, status, course_id), `availableCourses` (useState), `questions` (useState), `qForm` (useState — object with question_text, question_type, marks, options, correct_answer)
- **API calls:** `GET /exams/:id`, `GET /exams/:id/questions`, `GET /courses`, `POST /exams`, `PUT /exams/:id`, `POST /exams/:id/questions`, `DELETE /exams/questions/:questionId`
- **Navigates to:** `/lecturer/dashboard`, `/manage/exams/:id` (after create), `/manage/monitoring`, `/manage/audit-logs`, `/regulations`

##### `frontend/src/pages/ExamSummary.jsx`
Exam summary analytics page showing enrolled count, submission count, completion rate, average/highest/lowest scores, a score distribution bar chart, a student results table with percentage and flagged activity counts, and CSV export.

- **State variables:** `submissions` (useState), `loading` (useState), `error` (useState), `examMeta` (useState — object with title, duration, course_code, enrolled_count)
- **API calls:** `GET /sessions/exam/:examId/submissions`
- **Navigates to:** `/lecturer/dashboard`, `/manage/monitoring`, `/manage/audit-logs`, `/regulations`

##### `frontend/src/pages/GradingPanel.jsx`
Lecturer grading interface showing all submissions for an exam with expandable rows to view each student's answers and assign scores to subjective questions. Displays grading status (MCQ Only, Fully Graded, Pending) and nullified answer warnings.

- **State variables:** `submissions` (useState), `loading` (useState), `error` (useState), `examTitle` (useState), `expandedSession` (useState), `sessionDetails` (useState), `detailsLoading` (useState), `scores` (useState), `saveStatus` (useState)
- **API calls:** `GET /sessions/exam/:examId/submissions`, `GET /sessions/:sessionId/results`, `PUT /sessions/:sessionId/answers/:answerId/grade`
- **Navigates to:** `/lecturer/dashboard`, `/manage/monitoring`, `/manage/audit-logs`, `/regulations`

##### `frontend/src/pages/MonitoringPanel.jsx`
Real-time monitoring dashboard with a 60/40 split layout. Left panel shows live active/flagged sessions with tab switch counts (including total away seconds), fullscreen exit counts, and status. Right panel shows unreviewed alerts with severity badges, away duration details, and a "Mark Reviewed" button. Auto-refreshes every 30 seconds.

- **State variables:** `sessions` (useState), `alerts` (useState), `loading` (useState), `error` (useState)
- **API calls:** `GET /monitoring/sessions`, `GET /monitoring/alerts`, `PUT /monitoring/alerts/:id/review`
- **Navigates to:** `/lecturer/dashboard`, `/manage/audit-logs`, `/regulations`

##### `frontend/src/pages/AuditLogs.jsx`
Paginated audit log viewer with filters for search (username/email), activity type, and date. Supports pagination and shows timestamp, username, activity type badge, description, and session ID.

- **State variables:** `logs` (useState), `total` (useState), `totalPages` (useState), `loading` (useState), `error` (useState), `search` (useState), `debouncedSearch` (useState), `activityType` (useState), `date` (useState), `page` (useState)
- **API calls:** `GET /monitoring/audit-logs` (with query params: page, limit, search, activity_type, date)
- **Navigates to:** `/lecturer/dashboard`, `/manage/monitoring`, `/regulations`

##### `frontend/src/pages/AdminPanel.jsx`
Admin dashboard with two tabs: User Management (CRUD users with role selection, MFA status display, and welcome email on creation) and System Overview (stats cards for students, lecturers, exams, sessions plus recent activity log table).

- **State variables:** `activeTab` (useState), `users` (useState), `showCreateForm` (useState), `newUser` (useState), `stats` (useState), `recentActivity` (useState)
- **API calls:** `GET /users`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id`, `GET /admin/stats`, `GET /monitoring/audit-logs?limit=20`
- **Navigates to:** `/admin/dashboard`, `/regulations`

##### `frontend/src/pages/StaffDashboard.jsx`
Staff course management dashboard with a left panel listing all courses (with enrollment count) and a create course form (with lecturer assignment dropdown), and a right panel showing enrolled students for the selected course with search-to-enroll and remove functionality.

- **State variables:** `courses` (useState), `selectedCourse` (useState), `loadingCourses` (useState), `showCreateForm` (useState), `newCourseCode` (useState), `newCourseName` (useState), `assignedLecturerId` (useState), `lecturers` (useState), `creatingCourse` (useState), `students` (useState), `loadingStudents` (useState), `searchQuery` (useState), `searchResults` (useState), `searching` (useState)
- **API calls:** `GET /courses`, `POST /courses`, `GET /courses/:id/students`, `POST /courses/:id/enroll`, `DELETE /courses/:id/students/:userId`, `GET /users?role=lecturer`, `GET /users?search=...&role=student`
- **Navigates to:** `/staff/dashboard`, `/regulations`

##### `frontend/src/pages/Unauthorized.jsx`
Static "Access Denied" page shown when a user lacks the required role for a route.

- **State variables:** None
- **API calls:** None
- **Navigates to:** `/dashboard`

##### `frontend/src/pages/ResumeVerify.jsx`
Step-up MFA verification page for resuming an in-progress exam session. Accepts a 6-digit OTP code and verifies it against the resume token.

- **State variables:** `otp` (useState), `error` (useState), `loading` (useState), `inputRef` (useRef)
- **API calls:** `POST /sessions/verify-resume`
- **Navigates to:** `/exam/:sessionId` (on success), `/dashboard` (if no resume token)

##### `frontend/src/pages/Regulations.jsx`
Displays all Zero-Trust security regulations fetched from the backend API, organized by category with rule, enforcement type, and consequence columns. Accessible to both authenticated and unauthenticated users.

- **State variables:** `data` (useState), `loading` (useState), `error` (useState)
- **API calls:** `GET /regulations`
- **Navigates to:** Previous page (back button)

---

#### 3.2 Components

##### `frontend/src/components/ProtectedRoute.jsx`
Route wrapper component that enforces authentication and optional role-based access control. Redirects to `/login` if not authenticated, or `/unauthorized` if the user's role is not in the allowed roles list. Renders nested routes via `<Outlet />`.

##### `frontend/src/components/RoleNavbar.jsx`
Reusable navigation bar component that displays the UTM logo, app name, welcome message with username and role, configurable navigation links (with NavLink active state), a special "Regulations" link with amber styling, and a logout button.

##### `frontend/src/components/ui.jsx`
Shared UI primitives for consistent page layout: `PageWrapper`, `PageMain`, `PageHeading`, `MetricCard`, `ErrorAlert`, `SuccessAlert`.

---

#### 3.3 Context

##### `frontend/src/context/authContextStore.js`
Creates and exports the React Context object (`AuthContext`) using `createContext(null)`.

##### `frontend/src/context/AuthContext.jsx`
The `AuthProvider` component that wraps the entire app and provides global authentication state. Initializes from `localStorage` (`exam_token` and `exam_user`), and exposes `user`, `token`, `login()`, `logout()`, `isAuthenticated`, `isRole()`, and `isLoading`.

##### `frontend/src/context/useAuth.js`
Custom hook `useAuth()` that consumes `AuthContext` and throws an error if used outside `AuthProvider`.

---

#### 3.4 API

##### `frontend/src/api/axios.js`
Configured Axios instance with `baseURL: 'http://localhost:5001/api'`, 10-second timeout, and two interceptors:
- **Request interceptor:** Attaches the JWT token from `localStorage('exam_token')` as `Authorization: Bearer <token>` on every request.
- **Response interceptor:** On 401 responses, clears `exam_token` and `exam_user` from localStorage and redirects to `/login`.

---

### 4. DATABASE SUMMARY

#### Tables and Columns

##### User
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| user_id | INT | NO | AUTO_INCREMENT | PRI |
| username | VARCHAR(100) | NO | | |
| password | VARCHAR(255) | NO | | |
| email | VARCHAR(100) | NO | | UNI |
| role | ENUM('student','lecturer','staff','admin') | NO | | |
| mfa_secret | VARCHAR(255) | YES | NULL | |
| mfa_enabled | BOOLEAN | YES | FALSE | |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | |

##### Student
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| student_id | INT | NO | AUTO_INCREMENT | PRI |
| user_id | INT | NO | | FK → User(user_id) |
| student_matric | VARCHAR(50) | YES | NULL | |
| enrollment_info | VARCHAR(255) | YES | NULL | |

##### Admin
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| admin_id | INT | NO | AUTO_INCREMENT | PRI |
| user_id | INT | NO | | FK → User(user_id) |
| permissions | VARCHAR(255) | YES | NULL | |

##### Exam
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| exam_id | INT | NO | AUTO_INCREMENT | PRI |
| title | VARCHAR(200) | NO | | |
| description | TEXT | YES | NULL | |
| duration | INT | NO | | |
| created_by | INT | NO | | FK → User(user_id) |
| start_time | DATETIME | YES | NULL | |
| end_time | DATETIME | YES | NULL | |
| status | ENUM('draft','published','archived') | YES | 'draft' | |
| course_id | INT | YES | NULL | FK → Course(course_id) — *Phase 8 addition* |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | |

##### Question
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| question_id | INT | NO | AUTO_INCREMENT | PRI |
| exam_id | INT | NO | | FK → Exam(exam_id) |
| question_text | TEXT | NO | | |
| question_type | ENUM('mcq','short_answer','essay') | NO | | |
| options | JSON | YES | NULL | |
| correct_answer | TEXT | YES | NULL | |
| question_order | INT | YES | NULL | |
| marks | INT | NO | 1 | *Phase 8 addition* |

##### ExamSession
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| session_id | INT | NO | AUTO_INCREMENT | PRI |
| exam_id | INT | NO | | FK → Exam(exam_id) |
| user_id | INT | NO | | FK → User(user_id) |
| start_time | DATETIME | YES | NULL | |
| end_time | DATETIME | YES | NULL | |
| status | ENUM('in_progress','completed','flagged','abandoned') | YES | 'in_progress' | *'abandoned' added in Phase 9* |
| ip_address | VARCHAR(50) | YES | NULL | |
| device_info | TEXT | YES | NULL | |
| tab_switch_count | INT | YES | 0 | |
| fullscreen_exit_count | INT | YES | 0 | |
| last_heartbeat | DATETIME | YES | NULL | *Phase 9 addition* |

##### Answer
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| answer_id | INT | NO | AUTO_INCREMENT | PRI |
| session_id | INT | NO | | FK → ExamSession(session_id) |
| question_id | INT | NO | | FK → Question(question_id) |
| answer_text | TEXT | YES | NULL | |
| score | FLOAT | YES | 0 | |
| submitted_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | |

##### ActivityLog
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| log_id | INT | NO | AUTO_INCREMENT | PRI |
| session_id | INT | YES | NULL | FK → ExamSession(session_id) |
| user_id | INT | YES | NULL | FK → User(user_id) |
| timestamp | DATETIME | YES | CURRENT_TIMESTAMP | |
| activity_type | VARCHAR(100) | YES | NULL | |
| description | TEXT | YES | NULL | |

##### FlaggedActivity
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| flag_id | INT | NO | AUTO_INCREMENT | PRI |
| log_id | INT | NO | | FK → ActivityLog(log_id) |
| session_id | INT | NO | | FK → ExamSession(session_id) |
| flag_reason | VARCHAR(255) | YES | NULL | |
| severity | ENUM('low','medium','high') | YES | 'medium' | |
| flagged_at | DATETIME | YES | CURRENT_TIMESTAMP | |
| reviewed | BOOLEAN | YES | FALSE | |
| duration_away_seconds | INT | YES | NULL | *Phase 9 addition* |

##### Course *(Phase 8 addition)*
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| course_id | INT | NO | AUTO_INCREMENT | PRI |
| course_code | VARCHAR(20) | NO | | UNI |
| course_name | VARCHAR(200) | NO | | |
| created_by | INT | YES | NULL | FK → User(user_id) |
| assigned_lecturer_id | INT | YES | NULL | *Phase 9.1 addition* |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | |

##### CourseEnrollment *(Phase 8 addition)*
| Column | Type | Nullable | Default | Key |
|--------|------|----------|---------|-----|
| enrollment_id | INT | NO | AUTO_INCREMENT | PRI |
| course_id | INT | YES | NULL | FK → Course(course_id) |
| user_id | INT | YES | NULL | FK → User(user_id) |
| enrolled_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | |
| enrolled_by | INT | YES | NULL | FK → User(user_id) |
| | | | | UNI(course_id, user_id) |

#### Foreign Key Relationships

| Child Table | Child Column | Parent Table | Parent Column | On Delete |
|-------------|-------------|--------------|---------------|-----------|
| Student | user_id | User | user_id | CASCADE |
| Admin | user_id | User | user_id | CASCADE |
| Exam | created_by | User | user_id | RESTRICT |
| Exam | course_id | Course | course_id | (default) |
| Question | exam_id | Exam | exam_id | CASCADE |
| ExamSession | exam_id | Exam | exam_id | CASCADE |
| ExamSession | user_id | User | user_id | CASCADE |
| Answer | session_id | ExamSession | session_id | CASCADE |
| Answer | question_id | Question | question_id | CASCADE |
| ActivityLog | session_id | ExamSession | session_id | SET NULL |
| ActivityLog | user_id | User | user_id | SET NULL |
| FlaggedActivity | log_id | ActivityLog | log_id | CASCADE |
| FlaggedActivity | session_id | ExamSession | session_id | CASCADE |
| Course | created_by | User | user_id | (default) |
| CourseEnrollment | course_id | Course | course_id | (default) |
| CourseEnrollment | user_id | User | user_id | (default) |
| CourseEnrollment | enrolled_by | User | user_id | (default) |

#### Phase-by-Phase Column Additions

- **Phase 8 additions:** `Exam.course_id`, `Question.marks`, entire `Course` table, entire `CourseEnrollment` table
- **Phase 9 additions:** `FlaggedActivity.duration_away_seconds`, `ExamSession.last_heartbeat`, `ExamSession.status` ENUM value `'abandoned'`
- **Phase 9.1 addition:** `Course.assigned_lecturer_id`

---

### 5. AUTHENTICATION FLOW

#### Normal Login (MFA not enabled)

1. User enters email and password on the Login page (`/login`).
2. Frontend sends `POST /api/auth/login` with `{ email, password }`.
3. Backend queries `User` table by email.
4. Backend compares the submitted password against the stored bcrypt hash using `bcrypt.compare()`.
5. Backend checks `user.mfa_enabled` — it is `false`.
6. Backend captures the client IP from `req.ip`.
7. Backend creates a JWT payload containing `{ userId, email, username, role, ip }` and signs it with `JWT_SECRET` with expiry from `JWT_EXPIRES_IN` (default 15m).
8. Backend inserts a `LOGIN` entry into `ActivityLog`.
9. Backend returns `{ token, user: { userId, email, username, role } }`.
10. Frontend calls `login(token, user)` from `AuthContext`, storing both in React state and `localStorage` (`exam_token`, `exam_user`).
11. Frontend navigates to `/dashboard`, which redirects to the role-specific dashboard.

#### Login with MFA Enabled

1. Steps 1–4 are the same as above.
2. Backend detects `user.mfa_enabled === true`.
3. Backend creates a short-lived temporary JWT with `{ userId, stage: 'mfa' }` signed with `JWT_SECRET` and 5-minute expiry.
4. Backend returns `{ mfaRequired: true, tempToken }` — no login is logged yet.
5. Frontend stores `tempToken` in `localStorage('exam_temp_token')` and navigates to `/verify-mfa`.
6. User enters the 6-digit TOTP code from their authenticator app.
7. Frontend sends `POST /api/auth/verify-mfa` with `{ tempToken, otp }`.
8. Backend verifies the `tempToken` JWT, retrieves the user, and verifies the OTP against the user's `mfa_secret` using `speakeasy.totp.verify()` with a window of 1.
9. On success, backend creates a full JWT (same as step 7 of normal login) and returns `{ token, user }`.
10. Frontend removes `exam_temp_token`, calls `login()`, and navigates to `/dashboard`.

#### MFA Setup (First Time)

1. Authenticated user navigates to `/setup-mfa`.
2. Frontend sends `POST /api/auth/setup-mfa` (with JWT in Authorization header).
3. Backend generates a TOTP secret using `speakeasy.generateSecret()` with the label `UTM SecureExam:<email>`.
4. Backend stores the `secret.base32` in `User.mfa_secret` but does NOT set `mfa_enabled = true` yet.
5. Backend generates a QR code data URL using `qrcode.toDataURL()` and returns `{ qrCode, secret }`.
6. Frontend displays the QR code for the user to scan with Google Authenticator or Authy.
7. User enters the 6-digit code from their authenticator app.
8. Frontend sends `POST /api/auth/verify-mfa` with `{ tempToken: currentJWT, otp }`.
9. Backend verifies the OTP — on success, sets `User.mfa_enabled = TRUE` and issues a new full JWT.
10. Frontend updates the stored token and shows a success confirmation.

#### Token Refresh via Heartbeat During Exam

1. The ExamRoom component sends `POST /api/sessions/:id/heartbeat` every 60 seconds.
2. Backend verifies the current JWT via `verifyZeroTrust` middleware (including IP check).
3. Backend inserts a `HEARTBEAT` entry into `ActivityLog` and updates `ExamSession.last_heartbeat = NOW()`.
4. Backend creates a new JWT with the same payload (userId, email, username, role, current IP) and the same expiry duration (`JWT_EXPIRES_IN`).
5. Backend returns `{ alive: true, token: newToken }`.
6. Frontend updates the stored token in `localStorage('exam_token')`, effectively extending the session.

#### Step-Up MFA When Resuming an Exam

1. Student clicks "Continue" on an in-progress exam in the Student Dashboard.
2. Frontend sends `POST /api/sessions/:id/initiate-resume`.
3. Backend verifies the session belongs to the user and is `in_progress`.
4. Backend creates a short-lived resume token JWT with `{ userId, sessionId, stage: 'resume_mfa', ip }` and 5-minute expiry.
5. Backend logs a `RESUME_INITIATED` entry to `ActivityLog`.
6. Backend returns `{ resumeToken, requiresMFA: true }`.
7. Frontend stores `resumeToken` and `sessionId` in localStorage and navigates to `/resume-verify`.
8. User enters the 6-digit TOTP code.
9. Frontend sends `POST /api/sessions/verify-resume` with `{ resumeToken, otp }`.
10. Backend verifies the resume token, checks that `stage === 'resume_mfa'`, verifies the IP matches, and verifies the OTP against the user's `mfa_secret`.
11. Backend logs a `RESUME_VERIFIED` entry to `ActivityLog`.
12. Backend returns `{ verified: true, sessionId }`.
13. Frontend clears the resume tokens from localStorage and navigates to `/exam/:sessionId`.

#### What Happens When Token Expires or IP Changes

- **Token expires:** The `verifyZeroTrust` middleware catches `TokenExpiredError` and returns `401 { message: 'Token expired' }`. The frontend Axios response interceptor detects the 401, clears `exam_token` and `exam_user` from localStorage, and redirects to `/login`. During an exam, the heartbeat request fails with 401, and the ExamRoom navigates to `/login` with a session-expired message.
- **IP changes:** The `verifyZeroTrust` middleware compares `payload.ip` (from the JWT) with the current `req.ip`. On mismatch, it logs an `IP_MISMATCH` entry to `ActivityLog` and returns `403 { message: 'Session invalid: location changed' }`. The user must log in again from the new IP to get a new token.

---

### 6. ZERO-TRUST FEATURES IMPLEMENTED

| # | Feature | Zero-Trust Principle | File & Function | Behaviour |
|---|---------|---------------------|-----------------|-----------|
| 1 | JWT Authentication on Every Request | Verify Explicitly | `middleware/zeroTrust.js` → `verifyZeroTrust` | Every protected API request must include a valid JWT in the `Authorization: Bearer` header. Expired or malformed tokens are rejected. |
| 2 | IP Binding / Session Location Lock | Verify Explicitly | `middleware/zeroTrust.js` → `verifyZeroTrust` | The client IP is embedded in the JWT at login. Every subsequent request compares the current IP against the token IP. Mismatches are logged and blocked with 403. |
| 3 | User Existence Re-verification | Verify Explicitly | `middleware/zeroTrust.js` → `verifyZeroTrust` | On every request, the middleware queries the database to confirm the user still exists. Prevents access with tokens for deleted accounts. |
| 4 | Role-Based Access Control (RBAC) | Least Privilege | `middleware/zeroTrust.js` → `requireRole()` | Each route specifies which roles may access it. Users with insufficient roles receive 403. |
| 5 | Multi-Factor Authentication (TOTP) | Verify Explicitly | `controllers/authController.js` → `setupMFA`, `verifyMFA` | Users set up MFA via QR code. When MFA is enabled, login requires a valid 6-digit TOTP code in addition to password. |
| 6 | Step-Up MFA for Exam Resume | Verify Explicitly | `controllers/sessionController.js` → `initiateResume`, `verifyResume` | Resuming an in-progress exam requires re-verifying identity via MFA, even if the user already has a valid JWT. |
| 7 | Short-Lived JWT Tokens | Assume Breach | `controllers/authController.js` → `login`, `verifyMFA` | JWTs expire after 15 minutes (configurable via `JWT_EXPIRES_IN`). Short-lived tokens limit the window of opportunity if a token is compromised. |
| 8 | Token Refresh via Heartbeat | Verify Explicitly | `controllers/sessionController.js` → `heartbeat` | During exams, the frontend sends a heartbeat every 60 seconds. The backend issues a fresh JWT, extending the session only while the student is actively present. |
| 9 | Tab Switch Detection & Flagging | Assume Breach | `controllers/sessionController.js` → `logSuspiciousActivity` | Tab switches are detected by the frontend and reported to the backend. After 5 tab switches, the session status is changed to `'flagged'`. |
| 10 | Tab Switch Duration Tracking | Assume Breach | `controllers/sessionController.js` → `logSuspiciousActivity` | Each tab switch event records how many seconds the student was away from the exam tab. The duration is stored in `FlaggedActivity.duration_away_seconds` and displayed to lecturers. |
| 11 | Fullscreen Enforcement & Exit Logging | Assume Breach | `frontend/src/pages/ExamRoom.jsx` (Effect 1) + `controllers/sessionController.js` → `logSuspiciousActivity` | The exam is forced into fullscreen mode. Exits are detected, logged as `FULLSCREEN_EXIT` events, and the browser is automatically re-requested to enter fullscreen. |
| 12 | Copy/Paste/Right-Click Prevention | Assume Breach | `frontend/src/pages/ExamRoom.jsx` (Effect 3) | Copy, paste, cut, and right-click events are intercepted and blocked via `preventDefault()` during the exam session. |
| 13 | Session Sweeper (Abandoned Detection) | Assume Breach | `jobs/sessionSweeper.js` → `startSessionSweeper` | A cron job runs every 5 minutes, checking for sessions with no heartbeat for 3+ minutes. These sessions are marked `'abandoned'` and flagged with high severity. |
| 14 | Comprehensive Audit Logging | Assume Breach | `middleware/zeroTrust.js` → `verifyZeroTrust` + all controllers | Every API access, login, exam start, exam submit, heartbeat, tab switch, fullscreen exit, IP mismatch, grade action, and resume event is logged to `ActivityLog`. |
| 15 | Flagged Activity System | Assume Breach | `controllers/sessionController.js` → `logSuspiciousActivity` + `controllers/monitoringController.js` | Suspicious events create `FlaggedActivity` records with severity levels. Lecturers review alerts in real-time on the Monitoring Panel. |
| 16 | Score Nullification After Flagging | Assume Breach | `controllers/sessionController.js` → `submitExam`, `gradeAnswer` | Answers submitted after a session is flagged have their scores set to 0 automatically. Lecturers cannot assign marks to nullified answers. |
| 17 | Course Enrollment Enforcement | Least Privilege | `controllers/examController.js` → `getAllExams`, `getExamById` + `controllers/sessionController.js` → `startSession` | Students can only see and start exams for courses they are enrolled in. Unenrolled students receive 403. |
| 18 | Lecturer Course Ownership Enforcement | Least Privilege | `controllers/examController.js` → `createExam`, `updateExam` | Lecturers can only create exams for courses they are assigned to. Attempting to create/update an exam for another lecturer's course returns 403. |
| 19 | Exam Time Window Enforcement | Verify Explicitly | `controllers/sessionController.js` → `startSession` | Students cannot start an exam before `start_time` or after `end_time`. The backend enforces this at session creation. |
| 20 | Auto-Submit on Timer Expiry | Assume Breach | `frontend/src/pages/ExamRoom.jsx` (Effect 5) | When the countdown timer reaches zero, the exam is automatically submitted without user interaction. |
| 21 | No Fallback JWT Secret | Verify Explicitly | `middleware/zeroTrust.js`, `controllers/authController.js`, `controllers/sessionController.js` | All JWT operations check that `process.env.JWT_SECRET` is defined. If missing, the server returns 500 rather than falling back to a hardcoded secret. |
| 22 | Question Shuffling | Assume Breach | `controllers/sessionController.js` → `getSessionQuestions` | Questions are shuffled using the Fisher-Yates algorithm before being sent to the student, reducing the effectiveness of answer sharing. |
| 23 | Correct Answer Hiding | Least Privilege | `controllers/sessionController.js` → `getSessionQuestions` + `controllers/examController.js` → `getQuestions` | The `correct_answer` field is stripped from question data sent to students during the exam. Only lecturers and admins can see correct answers. |
| 24 | Email Notifications on Security Events | Assume Breach | `services/emailService.js` + various controllers | Lecturers are automatically notified by email when a student starts an exam, submits an exam, or has their session flagged. Students receive submission confirmations and are notified of new exam availability. |
| 25 | Regulations Transparency | Verify Explicitly | `controllers/regulationsController.js` + `frontend/src/pages/Regulations.jsx` + `frontend/src/pages/StudentDashboard.jsx` | All Zero-Trust rules are publicly accessible. Students must acknowledge regulations before starting an exam via a confirmation modal. |

---

### 7. ROUTING MAP

| Path | Component | Auth Required | Allowed Roles |
|------|-----------|---------------|---------------|
| `/login` | Login | No | All |
| `/verify-mfa` | MFAVerify | No | All |
| `/resume-verify` | ResumeVerify | No | All |
| `/unauthorized` | Unauthorized | No | All |
| `/regulations` | Regulations | No | All |
| `/dashboard` | Dashboard | Yes | All authenticated |
| `/setup-mfa` | MFASetup | Yes | All authenticated |
| `/student/dashboard` | StudentDashboard | Yes | student |
| `/exam/:sessionId` | ExamRoom | Yes | student |
| `/results/:sessionId` | Results | Yes | student |
| `/lecturer/dashboard` | LecturerDashboard | Yes | lecturer |
| `/manage/exams/new` | ExamBuilder | Yes | lecturer |
| `/manage/exams/:id` | ExamBuilder | Yes | lecturer |
| `/manage/exams/:examId/summary` | ExamSummary | Yes | lecturer |
| `/manage/grading/:examId` | GradingPanel | Yes | lecturer |
| `/manage/monitoring` | MonitoringPanel | Yes | lecturer |
| `/manage/audit-logs` | AuditLogs | Yes | lecturer |
| `/admin/dashboard` | AdminPanel | Yes | admin |
| `/admin/users` | AdminPanel | Yes | admin |
| `/staff/dashboard` | StaffDashboard | Yes | staff |
| `/` | Redirect → `/dashboard` | — | — |
| `*` | Redirect → `/unauthorized` | — | — |

---

### 8. EMAIL NOTIFICATIONS

| # | Trigger Event | Recipient | Email Subject | Function in emailService.js | Called By | Condition |
|---|--------------|-----------|---------------|----------------------------|----------|-----------|
| 1 | Student starts an exam session | Lecturer | `[SecureExam UTM] Student Has Started Exam` | `sendExamStartedEmail` | `sessionController.startSession` | Always when a session is created successfully |
| 2 | Student submits an exam | Student | `[SecureExam UTM] Exam Submission Confirmed` | `sendExamSubmittedEmail` | `sessionController.submitExam` | Always on successful submission |
| 3 | Student submits an exam | Lecturer | `[SecureExam UTM] Student Has Submitted Exam` | `sendExamSubmittedLecturerEmail` | `sessionController.submitExam` | Always on successful submission (if lecturer email is found) |
| 4 | Session is flagged (5+ tab switches) | Lecturer | `[SecureExam UTM] ALERT: Exam Session Flagged` | `sendSessionFlaggedEmail` | `sessionController.logSuspiciousActivity` | When tab switch count reaches the threshold of 5 and status changes to `'flagged'` |
| 5 | Admin creates a new user | New user | `[SecureExam UTM] Welcome — Your Account Is Ready` | `sendWelcomeEmail` | `userController.createUser` | Always when a user is created via admin panel |
| 6 | Exam status is changed to published | Enrolled students | `[SecureExam UTM] New Exam Available: <title>` | `sendExamPublishedEmail` | `examController.updateExam` | When `status` is changed to `'published'` and the exam has a `course_id` — sends to all enrolled students |

---

### 9. ENVIRONMENT CONFIGURATION

| Variable | File(s) Used In | What It Controls | Current Value Description | Actively Used |
|----------|----------------|------------------|--------------------------|---------------|
| `DB_HOST` | `backend/config/db.js` | MySQL database host | `localhost` | Yes |
| `DB_USER` | `backend/config/db.js` | MySQL database username | `root` | Yes |
| `DB_PASSWORD` | `backend/config/db.js` | MySQL database password | Empty string (no password) | Yes |
| `DB_NAME` | `backend/config/db.js` | MySQL database name | `secure_exam_db` | Yes |
| `JWT_SECRET` | `backend/middleware/zeroTrust.js`, `backend/controllers/authController.js`, `backend/controllers/sessionController.js` | Secret key used to sign and verify all JWTs | 64-character hex string | Yes |
| `JWT_EXPIRES_IN` | `backend/controllers/authController.js`, `backend/controllers/sessionController.js` | JWT token expiration duration | `15m` (15 minutes) | Yes |
| `PORT` | `backend/server.js` | Backend server port number | `5001` | Yes |
| `EMAIL_USER` | `backend/services/emailService.js` | Gmail address used as the sender for all email notifications | Gmail address for UTM SecureExam | Yes |
| `EMAIL_PASS` | `backend/services/emailService.js` | Gmail app password for SMTP authentication | Gmail app-specific password | Yes |

---

### 10. KNOWN ISSUES OR INCOMPLETE PARTS

No known issues. System is at 100% completion.

- No TODO or FIXME comments exist in any project source file (only in third-party `node_modules`).
- No hardcoded secrets exist — all JWT operations check for `process.env.JWT_SECRET` and fail closed if not set.
- All features described in Phases 1–9 and subsequent hotfixes are fully implemented and consistent between frontend and backend.

---

### 11. PHASES COMPLETED

#### Phase 1: Environment Setup
IMPLEMENTED — Node.js backend with Express, React frontend with Vite, MySQL database, project structure with `backend/` and `frontend/` directories, `.env` configuration, and all dependencies installed.

#### Phase 2: Database Schema
IMPLEMENTED — Base schema in `backend/config/schema.sql` with tables: `User`, `Student`, `Admin`, `Exam`, `Question`, `ExamSession`, `Answer`, `ActivityLog`, `FlaggedActivity`. All foreign keys, constraints, and ENUM types defined.

#### Phase 3: Backend Foundation
IMPLEMENTED — Express server (`backend/server.js`) with Helmet security headers, CORS for frontend, JSON body parsing, health check endpoint, Zero-Trust middleware (`backend/middleware/zeroTrust.js`) with JWT verification, IP binding, user existence check, API access logging, and RBAC via `requireRole()`. Auth routes and controllers with registration, login, MFA setup/verify.

#### Phase 4: Exam Management APIs
IMPLEMENTED — Full CRUD for exams and questions in `backend/controllers/examController.js` and `backend/routes/exams.js`. Supports MCQ, short answer, and essay question types. Lecturers scoped to their own exams, students see only published exams.

#### Phase 5: Exam Session (Zero-Trust Core)
IMPLEMENTED — Complete exam session lifecycle in `backend/controllers/sessionController.js`: session start with duplicate detection, question retrieval with Fisher-Yates shuffle and answer key stripping, answer save (upsert), auto-grading MCQs on submit, heartbeat with token refresh, suspicious activity logging (TAB_SWITCH, FULLSCREEN_EXIT, COPY_ATTEMPT, PASTE_ATTEMPT, RIGHT_CLICK), session flagging at 5 tab switches, score nullification for post-flag answers, and monitoring endpoints in `backend/controllers/monitoringController.js`.

#### Phase 6: Frontend Setup
IMPLEMENTED — React app with Vite, Tailwind CSS, React Router v7, Axios instance with JWT interceptors, AuthContext with localStorage persistence, ProtectedRoute wrapper with role-based access control.

#### Phase 7: All Frontend Pages (7.1–7.11)
IMPLEMENTED — All pages built:
- 7.1: Login page with MFA detection
- 7.2: MFA Verify page
- 7.3: MFA Setup page with QR code
- 7.4: Dashboard (role-based redirect hub)
- 7.5: Student Dashboard with exam cards and status tracking
- 7.6: ExamRoom with fullscreen enforcement, tab switch detection, copy/paste prevention, countdown timer, heartbeat, question navigation, auto-save
- 7.7: Results page with score review and nullification indicators
- 7.8: Lecturer Dashboard with exam management table
- 7.9: Exam Builder with settings and question editor
- 7.10: Monitoring Panel with live sessions and alert review
- 7.11: Audit Logs with filters and pagination

#### Phase 8: Course Enrollment, Marks, Grading, Summary, Staff Dashboard, Time Window Enforcement
IMPLEMENTED — `Course` and `CourseEnrollment` tables added in `schema_v2.sql`. `course_id` added to `Exam`, `marks` added to `Question`. Course controller and routes created. Staff Dashboard (`StaffDashboard.jsx`) with course creation, lecturer assignment, student enrollment/removal. Grading Panel (`GradingPanel.jsx`) for lecturers to grade subjective answers. Exam Summary (`ExamSummary.jsx`) with analytics, score distribution chart, and CSV export. Admin Panel (`AdminPanel.jsx`) with user management and system overview. Time window enforcement in `startSession` checking `start_time` and `end_time`.

#### Phase 9: Token Refresh, Session Sweeper, Step-Up MFA, Regulations Panel, Email Notifications, Tab Duration Tracking
IMPLEMENTED — Token refresh integrated into heartbeat (`sessionController.heartbeat`). Session sweeper cron job (`jobs/sessionSweeper.js`) marks abandoned sessions after 3 minutes without heartbeat. Step-up MFA for exam resume (`initiateResume`, `verifyResume`, `ResumeVerify.jsx`). Regulations panel (`regulationsController.js`, `Regulations.jsx`) with full Zero-Trust rule display. Email notifications via Nodemailer (`services/emailService.js`) for 6 event types. Tab switch duration tracking with `duration_away_seconds` in `FlaggedActivity` and display in Monitoring Panel. `schema_v3.sql` migration for `duration_away_seconds`. `schema_v4.sql` migration for `assigned_lecturer_id`.

#### JWT Fix: Removed All Fallback Secrets
IMPLEMENTED — All files that sign or verify JWTs (`authController.js`, `sessionController.js`, `zeroTrust.js`) use `process.env.JWT_SECRET` exclusively. Each function checks that `JWT_SECRET` is defined and returns 500 if not, rather than falling back to a hardcoded string.

#### Template Literal Fix: Fixed Escaped Interpolations
IMPLEMENTED — All template literals use proper `${}` interpolation syntax. No escaped interpolations (`\${}`) remain in the codebase.

#### Flagged Status Fix: Added Action Button in Dashboard
IMPLEMENTED — `StudentDashboard.jsx` handles the `'flagged'` session status with a "View Results" button and a warning message: "Your session was flagged for suspicious activity. Your lecturer has been notified."

#### JWT_EXPIRES_IN Fix: Wired Env Variable to Code
IMPLEMENTED — `authController.js` reads `JWT_EXPIRES_IN` from `process.env.JWT_EXPIRES_IN` (with `'15m'` fallback) and uses it for all JWT signing. `sessionController.heartbeat` also uses `process.env.JWT_EXPIRES_IN || '15m'` for token refresh.

#### Migration Fix: Created schema_v3.sql
IMPLEMENTED — `backend/config/schema_v3.sql` adds `duration_away_seconds INT NULL` to `FlaggedActivity`. `backend/config/schema_v4.sql` adds `assigned_lecturer_id INT NULL` to `Course`. Both use `ADD COLUMN IF NOT EXISTS` for safe re-runs.

---

### Summary Confirmation

1. **Sections in this file:** 11
2. **Backend route files documented:** 8 (auth.js, admin.js, users.js, exams.js, sessions.js, monitoring.js, courses.js, regulations.js)
3. **Frontend pages documented:** 17 (Login, MFAVerify, MFASetup, Dashboard, StudentDashboard, ExamRoom, Results, LecturerDashboard, ExamBuilder, ExamSummary, GradingPanel, MonitoringPanel, AuditLogs, AdminPanel, StaffDashboard, Unauthorized, ResumeVerify, Regulations — note: Regulations is listed under pages)
4. **Known issues found:** None — system is at 100% completion
