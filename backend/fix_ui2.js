const fs = require('fs');
let code = fs.readFileSync('/Users/chanqingyee/zero-trust-exam/frontend/src/pages/GradingPanel.jsx', 'utf8');
code = code.replace(
  "const saveScore = async (answerId, maxMarks) => {",
  "const saveScore = async (answerId, maxMarks) => {\n    console.log('saveScore called', {answerId, scoreVal: scores[answerId]});"
);
fs.writeFileSync('/Users/chanqingyee/zero-trust-exam/frontend/src/pages/GradingPanel.jsx', code);
