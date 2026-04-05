import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

const sessionTokenSchema = z.object({
  iss: z.literal('jellytube-session'),
  sub: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(['admin', 'user']),
  iat: z.number().int(),
  exp: z.number().int()
});

const handoffTokenSchema = z.object({
  iss: z.literal('jellytube-bridge'),
  sub: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(['admin', 'user']),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().min(1),
  returnTo: z.string().optional()
});

export type SessionTokenPayload = z.infer<typeof sessionTokenSchema>;
export type HandoffTokenPayload = z.infer<typeof handoffTokenSchema>;

const headerSegment = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export function issueSessionToken(payload: Omit<SessionTokenPayload, 'iss'>, secret: string): string {
  return signPayload({ ...payload, iss: 'jellytube-session' }, secret);
}

export function issueHandoffToken(payload: Omit<HandoffTokenPayload, 'iss'>, secret: string): string {
  return signPayload({ ...payload, iss: 'jellytube-bridge' }, secret);
}

export function verifySessionToken(token: string, secret: string): SessionTokenPayload {
  return verifySignedToken(token, secret, sessionTokenSchema);
}

export function verifyHandoffToken(token: string, secret: string): HandoffTokenPayload {
  return verifySignedToken(token, secret, handoffTokenSchema);
}

function verifySignedToken<T extends { exp: number }>(
  token: string,
  secret: string,
  schema: z.ZodType<T>
): T {
  const [header, payload, signature] = token.split('.');

  if (!header || !payload || !signature) {
    throw new Error('Malformed token');
  }

  const expected = signSegment(`${header}.${payload}`, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error('Invalid token signature');
  }

  const parsed = schema.parse(JSON.parse(decodeBase64Url(payload)));

  if (parsed.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return parsed;
}

function signPayload(payload: Record<string, unknown>, secret: string): string {
  const payloadSegment = encodeBase64Url(JSON.stringify(payload));
  const signature = signSegment(`${headerSegment}.${payloadSegment}`, secret);
  return `${headerSegment}.${payloadSegment}.${signature}`;
}

function signSegment(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}
