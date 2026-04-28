const db = require('./config/db');
async function fix() {
  const [courses] = await db.query('SELECT course_id FROM Course;');
  if (courses.length > 0) {
    await db.query('UPDATE Course SET assigned_lecturer_id = 2 WHERE assigned_lecturer_id IS NULL;');
    console.log('Fixed early courses!');
  }
  process.exit(0);
}
fix();
