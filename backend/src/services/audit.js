const { db } = require("../database/db");

function recordAudit({ actorUserId = null, action, entityType, entityId = null, details = {} }) {
  db.prepare(`
    INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(actorUserId, action, entityType, entityId === null ? null : String(entityId), JSON.stringify(details));
}

function listAudit(entityType = "", entityId = "") {
  return db.prepare(`
    SELECT a.*, u.username AS actor_username, u.role AS actor_role
    FROM audit_events a
    LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE (? = '' OR a.entity_type = ?)
      AND (? = '' OR a.entity_id = ?)
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 500
  `).all(entityType, entityType, String(entityId || ""), String(entityId || ""));
}

module.exports = { listAudit, recordAudit };
