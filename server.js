try {
  require('dotenv').config();
} catch (error) {
  console.log('dotenv not available, using default configuration');
}

const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fsSync = require('fs');

const appConfig = require('./backend/config/app');
const { initDatabase } = require('./backend/config/database');
const { errorHandler } = require('./backend/middleware/auth');

const authRoutes = require('./backend/routes/auth');
const gameRoutes = require('./backend/routes/games');
const adminRoutes = require('./backend/routes/admin');
const commentRoutes = require('./backend/routes/comments');
const notificationRoutes = require('./backend/routes/notifications');
const aiRoutes = require('./backend/routes/ai');
const debugRoutes = require('./backend/routes/debug');
const cookieRoutes = require('./backend/routes/cookies');
const discussionRoutes = require('./backend/routes/discussion');
const blueprintRoutes = require('./backend/routes/blueprints');
const paymentRoutes = require('./backend/routes/payments');
const { initDiscussionRealtime } = require('./backend/utils/discussionRealtime');

const app = express();

const isWindows = process.platform === 'win32';
console.log('🔍 环境检测:', isWindows ? 'Windows开发环境' : 'Linux生产环境');

const uniquePaths = (paths = []) => [...new Set(paths.filter(Boolean))];

const toCandidatePaths = (rawPath = '') => {
  const value = String(rawPath || '').trim();
  if (!value) return [];
  if (path.isAbsolute(value)) return [value];

  const candidates = [
    path.resolve(process.cwd(), value),
    path.resolve(__dirname, value)
  ];

  // 兼容运维常见写法：wwwroot/...（缺少开头 /）
  if (value.startsWith('wwwroot/')) {
    candidates.unshift(`/${value}`);
  }

  return uniquePaths(candidates);
};

const pickDataPath = (envValue, defaults = []) => {
  const envCandidates = toCandidatePaths(envValue);
  const existingEnvPath = envCandidates.find((item) => fsSync.existsSync(item));
  if (existingEnvPath) return existingEnvPath;
  if (envCandidates.length > 0) return envCandidates[0];

  const defaultCandidates = uniquePaths(defaults);
  const existingDefaultPath = defaultCandidates.find((item) => fsSync.existsSync(item));
  if (existingDefaultPath) return existingDefaultPath;
  return defaultCandidates[0];
};

const parsedTrustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
const trustProxy = parsedTrustProxyHops > 0 ? parsedTrustProxyHops : 'loopback';
app.set('trust proxy', trustProxy);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: '请求过于频繁，请稍后再试',
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  }
});

const uploadsPath = isWindows
  ? pickDataPath(process.env.UPLOADS_PATH, [path.join(__dirname, 'uploads')])
  : pickDataPath(process.env.UPLOADS_PATH, [
    '/wwwroot/dpccgaming.xyz/uploads',
    '/www/wwwroot/dpccgaming.xyz/uploads',
    path.join(__dirname, 'uploads')
  ]);

const gamesPath = isWindows
  ? pickDataPath(process.env.GAMES_ROOT_PATH, [path.join(__dirname, 'games')])
  : pickDataPath(process.env.GAMES_ROOT_PATH, [
    '/wwwroot/dpccgaming.xyz/games',
    '/www/wwwroot/dpccgaming.xyz/games',
    path.join(__dirname, 'games')
  ]);

const codePath = isWindows
  ? pickDataPath(process.env.CODE_ROOT_PATH, [path.join(uploadsPath, 'code')])
  : pickDataPath(process.env.CODE_ROOT_PATH, [
    '/wwwroot/dpccgaming.xyz/uploads/code',
    '/www/wwwroot/dpccgaming.xyz/uploads/code',
    path.join(uploadsPath, 'code')
  ]);

process.env.UPLOADS_PATH = process.env.UPLOADS_PATH || uploadsPath;
process.env.GAMES_ROOT_PATH = process.env.GAMES_ROOT_PATH || gamesPath;
process.env.CODE_ROOT_PATH = process.env.CODE_ROOT_PATH || codePath;

console.log('Upload root:', process.env.UPLOADS_PATH);
console.log('Games root:', process.env.GAMES_ROOT_PATH);
console.log('Code root:', process.env.CODE_ROOT_PATH);

app.use(cors({
  origin: appConfig.cors.origins,
  credentials: true
}));

app.use('/api/', generalLimiter);

const apiBodyLimit = process.env.API_BODY_LIMIT || '10mb';
app.use(bodyParser.json({ limit: apiBodyLimit }));
app.use(bodyParser.urlencoded({ extended: true, limit: apiBodyLimit }));

app.use('/uploads', express.static(process.env.UPLOADS_PATH));
app.use('/games', express.static(process.env.GAMES_ROOT_PATH));

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: isWindows ? 'Windows开发环境' : 'Linux生产环境'
  });
});

console.log('注册API路由...');

app.use('/api', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/cookies', cookieRoutes);
app.use('/api/discussion', discussionRoutes);
app.use('/api/blueprints', blueprintRoutes);
app.use('/api/payments', paymentRoutes);

app.use(errorHandler);

app.use('*', (req, res) => {
  res.status(404).json({ message: '请求的资源未找到' });
});

async function startServer() {
  try {
    console.log('初始化数据库连接...');
    await initDatabase();
    console.log('数据库连接初始化成功');

    const server = http.createServer(app);
    initDiscussionRealtime({
      server,
      corsOrigins: appConfig.cors.origins
    });

    server.listen(appConfig.server.port, () => {
      const port = appConfig.server.port;

      console.log('\nDpccGaming服务器启动成功');
      console.log('='.repeat(50));
      console.log(`服务器地址: http://localhost:${port}`);
      console.log(`环境模式: ${appConfig.server.nodeEnv}`);
      console.log(`操作系统: ${isWindows ? 'Windows开发环境' : 'Linux生产环境'}`);
      console.log(`文件上传目录: ${process.env.UPLOADS_PATH}`);
      console.log(`游戏文件目录: ${process.env.GAMES_ROOT_PATH}`);
      console.log(`源码目录: ${process.env.CODE_ROOT_PATH}`);
      console.log('='.repeat(50));
      console.log('已注册的路由:');
      console.log('   - /api/login, /api/register, /api/verify-token (用户认证)');
      console.log('   - /api/games/* (游戏管理与上传)');
      console.log('   - /api/games/:id/comments (评论系统)');
      console.log('   - /api/notifications/* (通知系统)');
      console.log('   - /api/ai/* (AI助手)');
      console.log('   - /api/admin/* (管理员功能)');
      console.log('   - /api/debug/* (调试工具)');
      console.log('   - /api/discussion/* (讨论模式/好友/匹配)');
      console.log('   - /api/blueprints/* (蓝图种子/副本持久化)');
      console.log('   - /api/payments/* (支付订单与支付宝回调)');
      console.log('   - /uploads/* (静态文件)');
      console.log('   - /games/* (游戏文件)');
      console.log('='.repeat(50));
    });

    process.on('SIGTERM', () => {
      console.log('收到SIGTERM信号，正在关闭服务器...');
      server.close(() => {
        console.log('服务器已安全关闭');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('收到SIGINT信号，正在关闭服务器...');
      server.close(() => {
        console.log('服务器已安全关闭');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
