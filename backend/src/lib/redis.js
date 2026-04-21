const Redis = require('ioredis');
const RedisMock = require('ioredis-mock');

const isProduction = process.env.NODE_ENV === 'production';
const redisUrl = process.env.REDIS_URL;
const usingMockRedis = !redisUrl && !isProduction;

if (!redisUrl && isProduction) {
  throw new Error('REDIS_URL is required in production');
}

function createClient() {
  if (usingMockRedis) return new RedisMock();
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

const redis = createClient();

function createAdapterClients() {
  if (usingMockRedis) return null;
  const pubClient = createClient();
  const subClient = pubClient.duplicate();
  return { pubClient, subClient };
}

module.exports = {
  redis,
  createAdapterClients,
  usingMockRedis,
};
