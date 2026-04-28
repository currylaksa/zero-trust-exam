const db = require('./config/db');

async function updateDb() {
  try {
    await db.query('ALTER TABLE Course ADD COLUMN assigned_lecturer_id INT NULL;');
    await db.query('ALTER TABLE Course ADD CONSTRAINT fk_course_assigned_lecturer FOREIGN KEY (assigned_lecturer_id) REFERENCES User(user_id) ON DELETE SET NULL ON UPDATE CASCADE;');
    console.log('Database altered successfully');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists');
    } else {
      console.error(err);
    }
  }
  process.exit(0);
}
updateDb();
