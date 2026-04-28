const fs = require('fs');
const file = '/Users/chanqingyee/zero-trust-exam/backend/controllers/sessionController.js';
let data = fs.readFileSync(file, 'utf8');
data = data.replace(/if \(session\.status !== 'in_progress'\)/g, "if (session.status !== 'in_progress' && session.status !== 'flagged')");
fs.writeFileSync(file, data);
