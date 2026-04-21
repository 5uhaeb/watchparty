# Room Permissions and Roles

## Role Model

Rooms have a hierarchical role system with three levels:

- **Owner**: The original creator of the room. Has full control over all permissions and can transfer ownership.
- **Admin**: Promoted users with elevated privileges. Can manage most room functions but cannot affect the owner.
- **Member**: Regular participants with basic access.

## Permission Matrix

| Permission | Owner | Admin | Member | Description |
|------------|-------|-------|--------|-------------|
| playPause | ✅ | ✅ (default) | ❌ | Control video playback (play/pause) |
| seek | ✅ | ✅ (default) | ❌ | Seek to different positions in video |
| changeSource | ✅ | ✅ (default) | ❌ | Change the video source URL |
| chat | ✅ | ✅ | ✅ (default) | Send chat messages |
| invite | ✅ | ✅ (default) | ❌ | Invite new users to the room |
| kickMute | ✅ | ✅ (default) | ❌ | Kick or mute other users |
| managePerms | ✅ (default) | ❌ | ❌ | Change room permission settings |
| manageAdmins | ✅ (default) | ❌ | ❌ | Promote/demote admins, transfer ownership |

## Default Settings

New rooms start with the following defaults:
- playPause: admins
- seek: admins
- changeSource: admins
- chat: everyone
- invite: admins
- kickMute: admins
- managePerms: owner
- manageAdmins: owner

## Special Rules

- Owners cannot be kicked, banned, or muted by anyone.
- Admins cannot perform actions on the owner or other admins (except demoting themselves if they are owner).
- Ownership can be transferred by the current owner to any member.
- When ownership is transferred, the new owner is automatically added to admins if not already.
- Banned users cannot rejoin the room.
- Muted users cannot send chat messages but can still see the chat.