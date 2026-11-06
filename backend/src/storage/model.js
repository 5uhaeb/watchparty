const storage = require("./drivebase");
const plain = (value) => JSON.parse(JSON.stringify(value));
const get = (object, path) =>
  path.split(".").reduce((v, key) => v?.[key], object);
function set(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((v, key) => (v[key] ||= {}), object);
  target[last] = value;
}
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = get(row, key);
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof Date) &&
      !expected.toHexString
    ) {
      return Object.entries(expected).every(([op, value]) => {
        if (op === "$in")
          return value.some((v) => String(v) === String(actual));
        if (op === "$lt") return new Date(actual) < new Date(value);
        if (op === "$gt") return new Date(actual) > new Date(value);
        if (op === "$ne") return String(actual) !== String(value);
        throw new Error(`Unsupported filter: ${op}`);
      });
    }
    return String(actual) === String(expected);
  });
}
function update(row, changes) {
  const result = plain(row);
  for (const [key, value] of Object.entries(changes.$set || changes))
    set(result, key, value);
  return result;
}
// Mongoose supplies casting, defaults and validation; it never opens a MongoDB connection.
module.exports = function driveModel(Model, collection) {
  function alive(row) {
    if (collection === "rooms")
      return Date.parse(row.lastActivityAt) + 6 * 3600000 > Date.now();
    if (collection === "guests")
      return Date.parse(row.lastSeenAt) + 7 * 86400000 > Date.now();
    return true;
  }
  function query(filter, single = false) {
    let ordering = {},
      max = Infinity,
      lean = false,
      fields;
    const q = {
      sort(value) {
        ordering = value;
        return q;
      },
      limit(value) {
        max = value;
        return q;
      },
      select(value) {
        fields = value;
        return q;
      },
      lean() {
        lean = true;
        return q;
      },
      async exec() {
        let rows = (await storage.list(collection)).filter(
          (row) => alive(row) && matches(row, filter),
        );
        rows.sort((a, b) => {
          for (const [key, direction] of Object.entries(ordering)) {
            const x = get(a, key),
              y = get(b, key);
            if (x !== y) return (x < y ? -1 : 1) * direction;
          }
          return 0;
        });
        rows = rows.slice(0, single ? 1 : max).map((row) => {
          if (fields)
            row = Object.fromEntries(
              ["_id", ...fields.split(/\s+/)].map((key) => [key, row[key]]),
            );
          return lean ? plain(row) : Model.hydrate(row);
        });
        return single ? rows[0] || null : rows;
      },
      then(resolve, reject) {
        return q.exec().then(resolve, reject);
      },
    };
    return q;
  }
  async function write(doc, deferred = false) {
    const now = new Date();
    if (Model.schema.options.timestamps) {
      if (!doc.createdAt) doc.createdAt = now;
      if (Model.schema.options.timestamps.updatedAt !== false)
        doc.updatedAt = now;
    }
    await doc.validate();
    for (const [field, path] of Object.entries(Model.schema.paths)) {
      if (path.options.unique && doc[field] != null) {
        const duplicate = (await storage.list(collection)).some(
          (row) =>
            String(row._id) !== String(doc._id) &&
            String(row[field]) === String(doc[field]),
        );
        if (duplicate) throw new Error(`Duplicate ${field}`);
      }
    }
    if (deferred) await storage.defer(collection, doc.toObject());
    else await storage.put(collection, doc.toObject());
    doc.isNew = false;
    return doc;
  }
  Model.prototype.save = function () {
    return storage.serial(collection, async () => {
      if (!this.isNew) {
        const existing = (await storage.list(collection)).find(
          (row) => String(row._id) === String(this._id),
        );
        if (!existing) throw new Error("Document no longer exists");
        const changes = Object.fromEntries(
          this.modifiedPaths().map((path) => [
            path,
            get(this.toObject(), path),
          ]),
        );
        this.set(update(existing, { $set: changes }));
      }
      return write(this);
    });
  };
  Model.find = (filter = {}) => query(filter);
  Model.findOne = (filter = {}) => query(filter, true);
  Model.findById = (id) => query({ _id: id }, true);
  Model.countDocuments = async (filter = {}) =>
    (await storage.list(collection)).filter((row) => matches(row, filter))
      .length;
  Model.create = (data) => new Model(data).save();
  Model.findOneAndUpdate = (filter, changes, options = {}) =>
    storage.serial(collection, async () => {
      const existing = (await storage.list(collection)).find(
        (row) => alive(row) && matches(row, filter),
      );
      if (!existing && !options.upsert) return null;
      const doc = new Model(update(existing || filter, changes));
      const paths = Object.keys(changes.$set || changes);
      const ephemeral =
        paths.length > 0 &&
        paths.every((path) =>
          collection === "rooms"
            ? path === "playback" ||
              path.startsWith("playback.") ||
              path === "lastActivityAt"
            : collection === "guests" && path === "lastSeenAt",
        );
      await write(doc, ephemeral);
      return options.new === false && existing ? Model.hydrate(existing) : doc;
    });
  Model.findByIdAndUpdate = (id, changes, options) =>
    Model.findOneAndUpdate({ _id: id }, changes, options);
  Model.findByIdAndDelete = (id) =>
    storage.serial(collection, async () => {
      const existing = (await storage.list(collection)).find(
        (row) => String(row._id) === String(id),
      );
      if (!existing) return null;
      await storage.remove(collection, id);
      return Model.hydrate(existing);
    });
  Model.bulkWrite = (operations) =>
    storage.serial(collection, async () => {
      for (const { updateOne } of operations) {
        const existing = (await storage.list(collection)).find((row) =>
          matches(row, updateOne.filter),
        );
        if (existing)
          await write(new Model(update(existing, updateOne.update)));
      }
    });
  return Model;
};
