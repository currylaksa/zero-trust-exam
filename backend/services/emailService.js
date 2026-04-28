// Email failures are non-fatal — errors are logged 
// to console but never propagate to the API response
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendExamStartedEmail({ 
  lecturerEmail, lecturerName, studentName, 
  examTitle, startTime, sessionId 
}) {
  try {
    const formattedStartTime = new Date(startTime).toLocaleString();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: lecturerEmail,
      subject: '[SecureExam UTM] Student Has Started Exam',
      html: `
        <p>Dear ${lecturerName},</p>
        <p>This is an automated notification that ${studentName} has started the exam: ${examTitle}</p>
        <p>Start time: ${formattedStartTime}</p>
        <p>Session ID: ${sessionId}</p>
        <p>You can monitor this session in real time at the Monitoring Panel.</p>
        <p>This email was sent automatically by SecureExam UTM.</p>
      `
    });
  } catch (error) {
    console.error('Email Error [sendExamStartedEmail]:', error);
  }
}

async function sendExamSubmittedEmail({ 
  studentEmail, studentName, examTitle, 
  submitTime, sessionId, score, totalMarks 
}) {
  try {
    const formattedSubmitTime = new Date(submitTime).toLocaleString();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: studentEmail,
      subject: '[SecureExam UTM] Exam Submission Confirmed',
      html: `
        <p>Dear ${studentName},</p>
        <p>Your exam submission has been received and recorded.</p>
        <p>Exam: ${examTitle}</p>
        <p>Submitted at: ${formattedSubmitTime}</p>
        <p>Session ID: ${sessionId}</p>
        <p>Provisional Score: ${score} / ${totalMarks}</p>
        <p>Please retain this email as proof of submission.</p>
        <p>This email was sent automatically by SecureExam UTM.</p>
      `
    });
  } catch (error) {
    console.error('Email Error [sendExamSubmittedEmail]:', error);
  }
}

async function sendExamSubmittedLecturerEmail({ 
  lecturerEmail, lecturerName, studentName, 
  examTitle, submitTime, sessionId 
}) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: lecturerEmail,
      subject: '[SecureExam UTM] Student Has Submitted Exam',
      html: `
        <p>Dear ${lecturerName},</p>
        <p>${studentName} has submitted the following exam:</p>
        <p>Exam: ${examTitle}</p>
        <p>Submitted at: ${submitTime}</p>
        <p>Session ID: ${sessionId}</p>
        <p>You can view and grade their submission in the Grading Panel.</p>
        <p>This email was sent automatically by SecureExam UTM.</p>
      `
    });
  } catch (error) {
    console.error('Email Error [sendExamSubmittedLecturerEmail]:', error);
  }
}

async function sendSessionFlaggedEmail({ 
  lecturerEmail, lecturerName, studentName, 
  examTitle, flagReason, tabSwitchCount, sessionId 
}) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: lecturerEmail,
      subject: '[SecureExam UTM] ALERT: Exam Session Flagged',
      html: `
        <h2 style="color: red;">ALERT: Exam Session Flagged</h2>
        <p>Dear ${lecturerName},</p>
        <p>An exam session has been automatically flagged for suspicious activity.</p>
        <p>Student: ${studentName}</p>
        <p>Exam: ${examTitle}</p>
        <p>Reason: ${flagReason}</p>
        <p>Tab switches detected: ${tabSwitchCount}</p>
        <p>Session ID: ${sessionId}</p>
        <p>Please review the session in the Monitoring Panel.</p>
        <p>This email was sent automatically by SecureExam UTM.</p>
      `
    });
  } catch (error) {
    console.error('Email Error [sendSessionFlaggedEmail]:', error);
  }
}

async function sendWelcomeEmail({
  studentEmail, studentName, role
}) {
  try {
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: studentEmail,
      subject: '[SecureExam UTM] Welcome — Your Account Is Ready',
      html: `
        <p>Dear ${studentName},</p>
        <p>Your ${role} account has been created on SecureExam UTM.</p>
        <p>You can log in at: <a href="${loginUrl}">${loginUrl}</a></p>
        <p>For security, you will be required to set up Multi-Factor Authentication on your first login.</p>
        <p>If you did not request this account, please contact your system administrator immediately.</p>
        <p>This email was sent automatically by SecureExam UTM.</p>
      `
    });
  } catch (error) {
    console.error('Email Error [sendWelcomeEmail]:', error);
  }
}

async function sendExamPublishedEmail({ 
  studentEmail, studentName, examTitle, 
  courseName, startTime, endTime, duration 
}) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: studentEmail,
      subject: `[SecureExam UTM] New Exam Available: ${examTitle}`,
      html: `
        <p>Dear ${studentName},</p>
        <p>A new exam has been published for your course.</p>
        <p>Exam: ${examTitle}</p>
        <p>Course: ${courseName}</p>
        <p>Duration: ${duration} minutes</p>
        <p>Available from: ${startTime || 'Immediately'}</p>
        <p>Available until: ${endTime || 'No deadline set'}</p>
        <p>Log in to SecureExam UTM to take the exam.</p>
        <p>This email was sent automatically by SecureExam UTM.</p>
      `
    });
  } catch (error) {
    console.error('Email Error [sendExamPublishedEmail]:', error);
  }
}

module.exports = {
  sendExamStartedEmail,
  sendExamSubmittedEmail,
  sendExamSubmittedLecturerEmail,
  sendSessionFlaggedEmail,
  sendWelcomeEmail,
  sendExamPublishedEmail
};