const storage = require("./drivebase");
// Preserve the original MongoDB TTL rules; prune slowly so chat requests can proceed.
let running = false;
async function prune() {
  if (running) return;
  running = true;
  try {
    const rooms = await storage.list("rooms");
    const expired = rooms.filter(
      (row) => Date.parse(row.lastActivityAt) + 6 * 3600000 <= Date.now(),
    );
    const expiredIds = new Set(expired.map((row) => String(row._id)));
    const liveIds = new Set(
      rooms
        .filter((row) => !expiredIds.has(String(row._id)))
        .map((row) => String(row._id)),
    );
    const messages = (await storage.list("messages")).filter(
      (row) => !liveIds.has(String(row.roomId)),
    );
    const guests = (await storage.list("guests")).filter(
      (row) => Date.parse(row.lastSeenAt) + 7 * 86400000 <= Date.now(),
    );
    let budget = 10;
    for (const [collection, documents] of [
      ["messages", messages],
      ["rooms", expired],
      ["guests", guests],
    ]) {
      for (const row of documents) {
        if (!budget--) return;
        await storage.serial(collection, async () => {
          const current = (await storage.list(collection)).find(
            (item) => String(item._id) === String(row._id),
          );
          if (!current) return;
          if (
            collection === "rooms" &&
            Date.parse(current.lastActivityAt) + 6 * 3600000 > Date.now()
          )
            return;
          if (
            collection === "guests" &&
            Date.parse(current.lastSeenAt) + 7 * 86400000 > Date.now()
          )
            return;
          if (
            collection === "messages" &&
            (await storage.list("rooms")).some(
              (room) =>
                String(room._id) === String(current.roomId) &&
                Date.parse(room.lastActivityAt) + 6 * 3600000 > Date.now(),
            )
          )
            return;
          await storage.remove(collection, String(row._id));
        });
      }
    }
  } finally {
    running = false;
  }
}
const timer = setInterval(
  () => prune().catch(() => console.error("Drivebase retention will retry")),
  60000,
);
timer.unref();
module.exports = { prune };
