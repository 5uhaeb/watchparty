const Redis = require('ioredis');
const RedisMock = require('ioredis-mock');

const rawRedisUrl = (process.env.REDIS_URL || '').trim();
const redisUrl = /^(redis|rediss):\/\//i.test(rawRedisUrl) ? rawRedisUrl : '';
const usingMockRedis = !redisUrl;

if (rawRedisUrl && !redisUrl) {
  console.warn('REDIS_URL is not a redis:// or rediss:// URL; using in-memory Redis fallback.');
}

function attachErrorHandler(client, label) {
  client.on('error', (error) => {
    console.warn(`${label} Redis error:`, error.message);
  });
  return client;
}

function createClient(label = 'presence') {
  if (usingMockRedis) return new RedisMock();
  return attachErrorHandler(new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
    enableReadyCheck: false,
    retryStrategy(times) {
      return Math.min(times * 200, 1000);
    },
  }), label);
}

const redis = createClient();

function createAdapterClients() {
  if (usingMockRedis) return null;
  const pubClient = createClient('socket pub/sub');
  const subClient = attachErrorHandler(pubClient.duplicate(), 'socket pub/sub duplicate');
  return { pubClient, subClient };
}

module.exports = {
  redis,
  createAdapterClients,
  usingMockRedis,
};
