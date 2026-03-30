import Redis from 'ioredis';
import { readFileSync } from 'fs';

function getRedisPassword(): string | undefined {
  try {
    return readFileSync('/run/secrets/chorequest_redis_password', 'utf-8').trim();
  } catch {
    // Not running in Docker Swarm or secret not mounted
  }
  return process.env.REDIS_PASSWORD;
}

const redisPassword = getRedisPassword();
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

const redis = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number | null {
    if (times > 5) {
      console.warn('Redis: max reconnect attempts reached, giving up');
      return null;
    }
    return Math.min(times * 500, 3000);
  },
  lazyConnect: true,
});

let redisAvailable = false;

redis.on('connect', () => {
  redisAvailable = true;
  console.log('Redis connected');
});

redis.on('close', () => {
  redisAvailable = false;
});

redis.on('error', (err: Error) => {
  redisAvailable = false;
  console.warn('Redis error (non-fatal, operating without Redis):', err.message);
});

redis.connect().catch((err: Error) => {
  console.warn('Redis initial connection failed (non-fatal):', err.message);
});

export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  if (!redisAvailable) return true;
  try {
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (err) {
    console.warn(`Redis acquireLock("${key}") failed, falling back:`, (err as Error).message);
    return true;
  }
}

export async function releaseLock(key: string): Promise<void> {
  if (!redisAvailable) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.warn(`Redis releaseLock("${key}") failed (will expire via TTL):`, (err as Error).message);
  }
}

export { redisAvailable };
export default redis;
