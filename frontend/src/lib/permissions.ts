export type PermissionLevel = 'owner' | 'admins' | 'everyone';

export interface Permissions {
  playPause: PermissionLevel;
  seek: PermissionLevel;
  changeSource: PermissionLevel;
  chat: PermissionLevel;
  invite: PermissionLevel;
  kickMute: PermissionLevel;
  managePerms: PermissionLevel;
  manageAdmins: PermissionLevel;
}

export type Role = 'owner' | 'admin' | 'member';

export interface RoomState {
  ownerUserId: string;
  adminUserIds: string[];
  permissions: Permissions;
  mutedUserIds: string[];
  bannedUserIds: string[];
}

/**
 * Get the role of a user in a room
 */
export function getRole(roomState: RoomState, userId: string): Role {
  if (roomState.ownerUserId === userId) return 'owner';
  if (roomState.adminUserIds.includes(userId)) return 'admin';
  return 'member';
}

/**
 * Check if a user can perform an action
 */
export function canDo(roomState: RoomState, userId: string, action: keyof Permissions): boolean {
  const userRole = getRole(roomState, userId);
  const perm = roomState.permissions[action];

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

/**
 * Get participants categorized by role
 */
export function getParticipantsByRole(room: any, roomState: RoomState) {
  const owner = room.participants.find((p: any) => p.userId === roomState.ownerUserId);
  const admins = room.participants.filter((p: any) => roomState.adminUserIds.includes(p.userId) && p.userId !== roomState.ownerUserId);
  const members = room.participants.filter((p: any) => p.userId !== roomState.ownerUserId && !roomState.adminUserIds.includes(p.userId));

  return { owner, admins, members };
}