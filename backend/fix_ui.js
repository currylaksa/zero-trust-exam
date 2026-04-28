const fs = require('fs');
let code = fs.readFileSync('/Users/chanqingyee/zero-trust-exam/frontend/src/pages/GradingPanel.jsx', 'utf8');
code = code.replace(/value=\{scores\[q.answer_id \|\| q.question_id\] \|\| ''\}/g, "value={scores[q.answer_id || q.question_id] !== undefined ? scores[q.answer_id || q.question_id] : ''}");
fs.writeFileSync('/Users/chanqingyee/zero-trust-exam/frontend/src/pages/GradingPanel.jsx', code);
