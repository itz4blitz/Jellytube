import { resolve } from 'node:path';

import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  });

const envSchema = z.object({
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3135),
  APP_NAME: z.string().trim().min(1).default('Jellytube'),
  JELLYFIN_URL: z.string().trim().url(),
  JELLYFIN_PUBLIC_URL: z.string().trim().url().optional(),
  METUBE_URL: z.string().trim().url(),
  COOKIE_NAME: z.string().trim().min(1).default('jellytube_session'),
  COOKIE_SECRET: z.string().trim().min(32),
  HANDOFF_SECRET: z.string().trim().min(32),
  COOKIE_SECURE: booleanish.default(false),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  DATA_FILE: z.string().trim().min(1).default('./apps/server/data/store.json'),
  ALLOW_PASSWORD_LOGIN: booleanish.default(true),
  AUTO_APPROVE_VIDEO_REQUESTS: booleanish.default(false),
  DEFAULT_QUALITY: z.string().trim().min(1).default('best'),
  ALLOWED_HOSTS: z.string().trim().default('youtube.com,youtu.be,rumble.com,odysee.com'),
  JELLYFIN_BRIDGE_START_PATH: z.string().trim().default('/JellytubeBridge/start')
});

export interface AppConfig {
  HOST: string;
  PORT: number;
  APP_NAME: string;
  JELLYFIN_URL: string;
  JELLYFIN_PUBLIC_URL?: string;
  METUBE_URL: string;
  COOKIE_NAME: string;
  COOKIE_SECRET: string;
  HANDOFF_SECRET: string;
  COOKIE_SECURE: boolean;
  SESSION_TTL_SECONDS: number;
  DATA_FILE: string;
  ALLOW_PASSWORD_LOGIN: boolean;
  AUTO_APPROVE_VIDEO_REQUESTS: boolean;
  DEFAULT_QUALITY: string;
  ALLOWED_HOSTS: string[];
  JELLYFIN_BRIDGE_START_PATH: string;
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);

  return {
    ...parsed,
    DATA_FILE: resolve(process.cwd(), parsed.DATA_FILE),
    JELLYFIN_URL: trimTrailingSlash(parsed.JELLYFIN_URL),
    JELLYFIN_PUBLIC_URL: parsed.JELLYFIN_PUBLIC_URL ? trimTrailingSlash(parsed.JELLYFIN_PUBLIC_URL) : undefined,
    METUBE_URL: trimTrailingSlash(parsed.METUBE_URL),
    ALLOWED_HOSTS: parsed.ALLOWED_HOSTS.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    JELLYFIN_BRIDGE_START_PATH: normalizePath(parsed.JELLYFIN_BRIDGE_START_PATH)
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizePath(value: string): string {
  if (!value) {
    return '/';
  }

  return value.startsWith('/') ? value : `/${value}`;
}
