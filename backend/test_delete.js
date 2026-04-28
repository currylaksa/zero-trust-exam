const pool = require('./config/db');
(async () => {
    try {
        await pool.query('DELETE FROM User WHERE user_id = ?', [2]);
        console.log('Success');
    } catch (err) {
        console.log('Error deleting user:', err);
    }
    process.exit(0);
})();
