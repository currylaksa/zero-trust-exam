const db = require('./config/db');

async function check() {
  const [tables] = await db.query('SHOW TABLES;');
  console.log('Tables:', tables);

  const [cols] = await db.query('DESCRIBE Course;');
  console.log('Course Cols:', cols);

  const [cols2] = await db.query('DESCRIBE CourseEnrollment;');
  console.log('CourseEnrollment Cols:', cols2);

  process.exit(0);
}
check();
