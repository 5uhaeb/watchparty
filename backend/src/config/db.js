const storage = require('../storage/drivebase');
module.exports = async function connectDB() { await storage.ready(); await Promise.all(['rooms','guests','messages'].map(name => storage.list(name))); require('../storage/retention'); console.log('Drivebase connected'); };
