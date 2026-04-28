const db = require('./config/db');

async function update() {
  try {
    await db.query('ALTER TABLE Exam ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
    console.log('Added created_at to Exam table');
  } catch(e) {
    if(e.code === 'ER_DUP_FIELDNAME') console.log('Column already exists');
    else console.error(e);
  }
  process.exit(0);
}
update();
