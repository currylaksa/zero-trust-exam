const db = require('./config/db');

async function check() {
  const [cols] = await db.query('DESCRIBE Exam;');
  console.log(cols);
  process.exit(0);
}
check();
