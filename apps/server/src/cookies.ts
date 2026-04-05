import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from './config.js';
import { issueSessionToken, verifySessionToken, type SessionTokenPayload } from './tokens.js';

export function readSession(
  request: FastifyRequest,
  config: Pick<AppConfig, 'COOKIE_NAME' | 'COOKIE_SECRET'>
): SessionTokenPayload | null {
  const raw = request.cookies[config.COOKIE_NAME];

  if (!raw) {
    return null;
  }

  try {
    return verifySessionToken(raw, config.COOKIE_SECRET);
  } catch {
    return null;
  }
}

export function setSession(
  reply: FastifyReply,
  config: Pick<AppConfig, 'COOKIE_NAME' | 'COOKIE_SECRET' | 'COOKIE_SECURE' | 'SESSION_TTL_SECONDS'>,
  user: Omit<SessionTokenPayload, 'iss' | 'iat' | 'exp'>
): void {
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = issueSessionToken(
    {
      ...user,
      iat: issuedAt,
      exp: issuedAt + config.SESSION_TTL_SECONDS
    },
    config.COOKIE_SECRET
  );

  reply.setCookie(config.COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    maxAge: config.SESSION_TTL_SECONDS
  });
}

export function clearSession(reply: FastifyReply, config: Pick<AppConfig, 'COOKIE_NAME'>): void {
  reply.clearCookie(config.COOKIE_NAME, { path: '/' });
}
