const db = require('./config/db');

async function test() {
  const [rows] = await db.query('SELECT created_at FROM Exam LIMIT 1;');
  console.log(rows[0]);
  process.exit(0);
}
test();
