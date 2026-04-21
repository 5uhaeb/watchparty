# Guest Identity

WatchParty uses anonymous guest identity instead of accounts. There are no emails, passwords, third-party sign-in redirects, or user-managed credentials.

## Guest Creation

On first app load, the frontend calls `POST /api/guest/bootstrap` with `credentials: "include"`.

If no valid identity exists, the backend creates a `Guest` document:

- `_id`: ULID string
- `displayName`: generated two-word name such as `Crimson Otter`
- `avatarHue`: number from `0` to `359`
- `createdAt`: creation timestamp
- `lastSeenAt`: updated on authenticated requests

Guests can change `displayName` at any time through `PATCH /api/guest/me`.

## JWT Cookie

The backend signs an HS256 JWT with `GUEST_JWT_SECRET` and stores it in an httpOnly cookie named `wp_guest`.

JWT payload:

```json
{
  "guestId": "01...",
  "displayName": "Crimson Otter",
  "avatarHue": 210,
  "iat": 123,
  "exp": 456
}
```

JWT lifetime is 24 hours. The cookie lifetime is 30 days:

- `httpOnly: true`
- `secure: true` in production
- `sameSite: "lax"`
- `path: "/"`

The cookie stores the JWT directly. When a refresh happens, the backend overwrites the cookie with a new JWT.

## Silent Refresh

`POST /api/guest/bootstrap` accepts three states:

- Valid cookie and valid JWT: return the existing guest.
- Cookie with expired but decodable JWT: look up `guestId`, sign a fresh JWT, reset the cookie, return the guest.
- Missing or unrecoverable cookie: create a new guest, sign a JWT, set the cookie.

The `requireGuest` middleware applies the same refresh behavior for protected API routes. Socket.IO reads the same cookie during the handshake and accepts valid or refreshable guest JWTs.

## Cleanup

MongoDB deletes inactive guests automatically with a TTL index on `Guest.lastSeenAt`.

TTL: `60 * 60 * 24 * 7` seconds, or 7 days of inactivity.

Logging out clears only the browser cookie. The guest document remains until TTL cleanup.
