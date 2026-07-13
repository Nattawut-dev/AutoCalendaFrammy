import "server-only";

import { Redis } from "@upstash/redis";
import { getEnv } from "@/lib/env";

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    const env = getEnv();
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}
