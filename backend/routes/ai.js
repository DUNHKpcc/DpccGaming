const express = require('express');
const router = express.Router();

// 导入控制器
const aiController = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');

// AI代码助手路由
router.post('/code-assistant', authenticateToken, aiController.codeAssistant);

module.exports = router;
