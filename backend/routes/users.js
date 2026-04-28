const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyZeroTrust, requireRole } = require('../middleware/zeroTrust');


router.use(verifyZeroTrust);

router.get('/', requireRole('admin', 'staff'), userController.getUsers);
router.post('/', requireRole('admin'), userController.createUser);
router.put('/:id', requireRole('admin'), userController.updateUserRole);
router.delete('/:id', requireRole('admin'), userController.deleteUser);

module.exports = router;