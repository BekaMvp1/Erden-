/**
 * Утилита записи в журнал аудита
 */

const db = require('../models');

/**
 * Записать действие в журнал аудита
 */
async function logAudit(userId, action, entity, entityId = null) {
  try {
    await db.AuditLog.create({
      user_id: userId,
      action,
      entity,
      entity_id: entityId,
    });
  } catch (err) {
    console.error('Ошибка записи в audit_log:', err);
  }
}

module.exports = { logAudit };
