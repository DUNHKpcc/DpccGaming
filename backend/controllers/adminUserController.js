const path = require('path');
const fs = require('fs').promises;
const { getPool } = require('../config/database');
const { recordAdminAuditLog } = require('../utils/adminAudit');

const resolveGamesRoot = () => process.env.GAMES_ROOT_PATH || path.join(process.cwd(), 'games');
const resolveCodeRoot = () => process.env.CODE_ROOT_PATH || path.join(process.cwd(), 'uploads', 'code');

function checkPermission(req, res) {
  res.json({
    isAdmin: true,
    message: '管理员权限验证成功',
    user: {
      id: req.user.userId,
      username: req.user.username,
      role: req.user.role
    }
  });
}

async function getUsers(req, res) {
  try {
    const pool = getPool();
    const [users] = await pool.execute(`
      SELECT 
        id, username, email, role, status, created_at,
        CASE 
          WHEN role = 'super_admin' THEN '超级管理员'
          WHEN role = 'admin' THEN '管理员'
          ELSE '普通用户'
        END as role_name,
        CASE 
          WHEN status = 'active' THEN '正常'
          WHEN status = 'inactive' THEN '未激活'
          ELSE '已禁用'
        END as status_name
      FROM users 
      ORDER BY created_at DESC
    `);

    res.json({ users });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

async function updateUserRole(req, res) {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const adminId = req.user.userId;

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: '只有超级管理员才能修改用户角色' });
    }

    if (Number(userId) === Number(adminId)) {
      return res.status(400).json({ error: '不能修改自己的角色' });
    }

    if (!['user', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: '无效的用户角色' });
    }

    const pool = getPool();
    const [users] = await pool.execute(
      'SELECT id, username FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    await pool.execute(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, userId]
    );

    await recordAdminAuditLog(pool, {
      adminUserId: adminId,
      action: 'users.update_role',
      resourceType: 'user',
      resourceId: String(userId),
      metadata: {
        targetUsername: users[0].username,
        newRole: role
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    console.log(`管理员 ${adminId} 将用户 ${users[0].username} 的角色更改为 ${role}`);

    res.json({
      message: '用户角色更新成功',
      user: { id: Number(userId), username: users[0].username, role }
    });
  } catch (error) {
    console.error('更新用户角色错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

async function toggleUserBan(req, res) {
  try {
    const { userId } = req.params;
    const { action } = req.body;
    const adminId = req.user.userId;

    if (!['ban', 'unban'].includes(action)) {
      return res.status(400).json({ error: '无效的操作类型' });
    }

    const pool = getPool();
    const [users] = await pool.execute(
      'SELECT id, username, role FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = users[0];

    if (Number(userId) === adminId) {
      return res.status(400).json({ error: '不能对自己执行此操作' });
    }

    if (action === 'ban' && ['admin', 'super_admin'].includes(user.role)) {
      const [adminUser] = await pool.execute(
        'SELECT role FROM users WHERE id = ?',
        [adminId]
      );

      if (!adminUser.length || adminUser[0].role !== 'super_admin') {
        return res.status(403).json({ error: '只有超级管理员才能禁言其他管理员' });
      }
    }

    const newStatus = action === 'ban' ? 'banned' : 'active';
    await pool.execute(
      'UPDATE users SET status = ? WHERE id = ?',
      [newStatus, userId]
    );

    console.log(`管理员 ${adminId} ${action === 'ban' ? '禁言' : '解禁'} 了用户 ${user.username} (${userId})`);

    res.json({
      message: `用户${action === 'ban' ? '禁言' : '解禁'}成功`,
      user: {
        id: Number(userId),
        username: user.username,
        status: newStatus
      }
    });
  } catch (error) {
    console.error('用户禁言/解禁错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

async function deleteUser(req, res) {
  try {
    const { userId } = req.params;
    const adminId = req.user.userId;
    const pool = getPool();

    const [users] = await pool.execute(
      'SELECT id, username, role FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = users[0];

    if (Number(userId) === adminId) {
      return res.status(400).json({ error: '不能删除自己' });
    }

    if (['admin', 'super_admin'].includes(user.role)) {
      const [adminUser] = await pool.execute(
        'SELECT role FROM users WHERE id = ?',
        [adminId]
      );

      if (!adminUser.length || adminUser[0].role !== 'super_admin') {
        return res.status(403).json({ error: '只有超级管理员才能删除其他管理员' });
      }
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.execute('DELETE FROM comments WHERE user_id = ?', [userId]);
      await connection.execute('DELETE FROM notifications WHERE user_id = ?', [userId]);

      const [userGames] = await connection.execute(
        'SELECT game_id FROM games WHERE uploaded_by = ?',
        [userId]
      );

      const gamesRootPath = resolveGamesRoot();
      const codeRootPath = resolveCodeRoot();

      for (const game of userGames) {
        try {
          await fs.rm(path.join(gamesRootPath, game.game_id), { recursive: true, force: true });
          await fs.rm(path.join(codeRootPath, game.game_id), { recursive: true, force: true }).catch(() => {});
        } catch (fileError) {
          console.warn('删除游戏文件失败:', fileError.message);
        }
      }

      await connection.execute('DELETE FROM games WHERE uploaded_by = ?', [userId]);
      await connection.execute('DELETE FROM users WHERE id = ?', [userId]);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    console.log(`管理员 ${adminId} 彻底删除了用户 ${user.username} (${userId})`);

    res.json({
      message: '用户删除成功',
      user: {
        id: Number(userId),
        username: user.username
      }
    });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

module.exports = {
  checkPermission,
  getUsers,
  updateUserRole,
  toggleUserBan,
  deleteUser
};
