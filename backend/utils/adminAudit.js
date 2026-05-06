let adminAuditTableInitPromise = null;

const ensureAdminAuditLogsTable = async (executor) => {
  if (!adminAuditTableInitPromise) {
    adminAuditTableInitPromise = executor.execute(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        admin_user_id INT DEFAULT NULL,
        action VARCHAR(96) NOT NULL,
        resource_type VARCHAR(64) NOT NULL,
        resource_id VARCHAR(128) DEFAULT NULL,
        metadata_json TEXT DEFAULT NULL,
        ip_address VARCHAR(64) DEFAULT NULL,
        user_agent VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_admin_audit_logs_admin_user_id (admin_user_id),
        INDEX idx_admin_audit_logs_action_created_at (action, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((error) => {
      adminAuditTableInitPromise = null;
      throw error;
    });
  }

  await adminAuditTableInitPromise;
};

const recordAdminAuditLog = async (executor, payload = {}) => {
  await ensureAdminAuditLogsTable(executor);

  return executor.execute(
    `
      INSERT INTO admin_audit_logs
        (admin_user_id, action, resource_type, resource_id, metadata_json, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.adminUserId || null,
      String(payload.action || '').slice(0, 96),
      String(payload.resourceType || '').slice(0, 64),
      payload.resourceId ? String(payload.resourceId).slice(0, 128) : null,
      JSON.stringify(payload.metadata || {}),
      payload.ipAddress ? String(payload.ipAddress).slice(0, 64) : null,
      payload.userAgent ? String(payload.userAgent).slice(0, 255) : null
    ]
  );
};

module.exports = {
  ensureAdminAuditLogsTable,
  recordAdminAuditLog
};
