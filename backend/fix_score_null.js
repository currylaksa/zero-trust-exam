const mysql = require('mysql2/promise');
const db = require('./config/db');

async function fix() {
  try {
    await db.execute('ALTER TABLE Answer MODIFY score FLOAT DEFAULT NULL');
    await db.execute(`
      UPDATE Answer a 
      JOIN Question q ON a.question_id = q.question_id 
      SET a.score = NULL 
      WHERE q.question_type != 'mcq'
    `);
    console.log('Successfully updated Answer table to default NULL and cleared existing manual scores');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
fix();
