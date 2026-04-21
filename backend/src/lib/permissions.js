/**
 * Permission helpers for room roles and actions
 */

/**
 * Get the role of a user in a room
 * @param {Object} room - Room document
 * @param {string} userId - User ID
 * @returns {string} "owner" | "admin" | "member"
 */
function role(room, userId) {
  if (room.ownerUserId === userId) return 'owner';
  if (room.adminUserIds.includes(userId)) return 'admin';
  return 'member';
}

/**
 * Check if a user can perform an action in a room
 * @param {Object} room - Room document
 * @param {string} userId - User ID
 * @param {string} action - Action name
 * @returns {boolean}
 */
function can(room, userId, action) {
  const userRole = role(room, userId);
  const perm = room.permissions[action];

  if (!perm) return false; // Unknown action

  switch (perm) {
    case 'owner':
      return userRole === 'owner';
    case 'admins':
      return userRole === 'owner' || userRole === 'admin';
    case 'everyone':
      return true;
    default:
      return false;
  }
}

module.exports = { role, can };