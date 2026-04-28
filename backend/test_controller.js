require('dotenv').config();
const { submitExam } = require('./controllers/sessionController');

(async () => {
   const db = require('./config/db');
   const [sess] = await db.query("SELECT * FROM ExamSession ORDER BY session_id DESC LIMIT 1");
   if (!sess[0]) return console.log("No session found");
   await db.execute("UPDATE ExamSession SET status='in_progress' WHERE session_id=?", [sess[0].session_id]);
   
   const req = {
     params: { id: sess[0].session_id },
     user: { user_id: sess[0].user_id }
   };
   const res = {
     status: function(s) { 
        this.statusCode = s; 
        return this; 
     },
     json: function(data) {
        console.log('Result:', this.statusCode, data);
     }
   };
   
   await submitExam(req, res);
   process.exit(0);
})();
