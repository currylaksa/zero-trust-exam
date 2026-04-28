require('dotenv').config();
const db = require('./config/db');
(async () => {
   const [fields] = await db.query('DESCRIBE Question');
   console.log(fields);
   process.exit(0);
})();
