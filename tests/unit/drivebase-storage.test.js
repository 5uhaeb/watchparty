const { test } = require("node:test");
const assert = require("node:assert/strict");
const storage = require("../../backend/src/storage/drivebase");
const Room = require("../../backend/src/models/Room");
const Guest = require("../../backend/src/models/Guest");
const Message = require("../../backend/src/models/Message");

test("rooms checkpoint playback, retain successful durable writes and enforce guest/room retention", async (t) => {
  const records = new Map();
  let failing = false;
  storage.cache.clear();
  storage.pending.clear();
  t.mock.method(storage, "request", async (path, method = "GET", body) => {
    const match = path.match(
      /^\/collections\/([^/]+)\/documents(?:\/([^?]+))?/,
    );
    assert.ok(match);
    const [, collection, id] = match;
    const key = collection + ":" + id;
    if (failing && method === "PUT") throw new Error("Storage unavailable");
    if (method === "PUT") records.set(key, structuredClone(body.data));
    if (method === "DELETE") records.delete(key);
    return {
      documents: [...records]
        .filter(([key]) => key.startsWith(collection + ":"))
        .map(([, data]) => ({ data })),
    };
  });
  const room = await Room.create({
    code: "ABC123",
    title: "Storage test",
    createdByGuestId: "guest-1",
    ownerGuestId: "guest-1",
  });
  const key = "rooms:" + room._id;
  await Room.findOneAndUpdate(
    { code: "ABC123" },
    { $set: { "playback.isPlaying": true, "playback.currentTime": 12 } },
  );
  assert.equal(
    (await Room.findOne({ code: "ABC123" })).playback.currentTime,
    12,
  );
  assert.equal(records.get(key).playback.isPlaying, false);
  failing = true;
  await assert.rejects(storage.flush());
  assert.equal(storage.pending.size, 1);
  failing = false;
  await storage.flush();
  storage.cache.clear();
  assert.equal(
    (await Room.findOne({ code: "ABC123" })).playback.isPlaying,
    true,
  );
  const first = await Room.findOne({ code: "ABC123" }),
    second = await Room.findOne({ code: "ABC123" });
  first.title = "Updated title";
  await first.save();
  second.permissions.editTitle = "all";
  await second.save();
  assert.equal((await Room.findOne({ code: "ABC123" })).title, "Updated title");
  await Guest.create({ _id: "guest-1", displayName: "Guest", avatarHue: 120 });
  await Message.create({
    roomId: room._id,
    userId: "guest-1",
    username: "Guest",
    text: "History",
  });
  const expired = records.get(key);
  expired.lastActivityAt = new Date(Date.now() - 7 * 3600000).toISOString();
  records.set(key, expired);
  storage.cache.clear();
  assert.equal(await Room.findOne({ code: "ABC123" }), null);
  const { prune } = require("../../backend/src/storage/retention");
  await prune();
  assert.equal(
    [...records.keys()].some(
      (key) => key.startsWith("rooms:") || key.startsWith("messages:"),
    ),
    false,
  );
  assert.equal(
    [...records.keys()].some((key) => key.startsWith("guests:")),
    true,
  );
});
