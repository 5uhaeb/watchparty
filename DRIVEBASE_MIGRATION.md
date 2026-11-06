# Drivebase migration

This branch replaces MongoDB guests, rooms and messages with Drivebase document collections. The frontend stays on Vercel; Express and Socket.IO stay on Render. It retains guest identities without requiring account login.

The new frontend target is https://watchparty-no-login.vercel.app. Provisioning, importing the source database and configuring the backend are required before publishing the migration there.

## Configuration

Set DRIVEBASE_API_URL, DRIVEBASE_DATABASE_ID and DRIVEBASE_API_KEY using the watchparty entry in the private connection bundle. The key belongs only on Render. Set CLIENT_URL to the new Vercel origin and GUEST_JWT_SECRET to a generated secret. Set frontend NEXT_PUBLIC_API_URL to the Render origin plus /api and NEXT_PUBLIC_SOCKET_URL to that origin. Existing TURN and optional Janus configuration may be reused; Janus is a separate media service.

Install backend, frontend and root dependencies. Run npm run test:unit and npm run build --prefix frontend. Browser smoke tests use Playwright and require a separate test Drivebase database configured in the server environment. Never point those tests at the migrated application database.

## Persistence and limits

Room creation, source/permission changes, guest creation/name changes and chat wait for durable Drivebase writes. Playback position and guest last-seen updates are cached and checkpointed every 15 seconds, with a final flush on SIGTERM. An abrupt crash can lose the latest checkpoint interval of playback state. Presence and live calls remain transient.

Use one backend instance. Its warmed collection cache owns application writes; direct edits in the Drivebase studio require restarting this backend to reload the cache. Room expiry remains six hours and guest expiry seven days. A bounded background job removes expired records and messages for expired rooms. Keep the Drive folder Restricted and stay within the 10 MiB database limit.

Export/import only this project's source collections, preserving \_id and roomId strings, guest IDs and ISO timestamps. Active sockets and peer media cannot transfer between server origins; users reconnect through the new URL. Keep the old deployment and database for rollback. Writes to it are not mirrored.
