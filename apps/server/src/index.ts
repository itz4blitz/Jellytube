import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';

import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import staticPlugin from '@fastify/static';
import { z } from 'zod';

import { authenticateWithJellyfin } from './auth.js';
import { classifyUrl, isAllowedHost } from './classify.js';
import { clearSession, readSession, setSession } from './cookies.js';
import { loadConfig } from './config.js';
import { queueInMeTube } from './metube.js';
import { RequestStore } from './store.js';
import { verifyHandoffToken } from './tokens.js';
import type { JellytubeUser, RequestStatus } from './types.js';

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

const createRequestSchema = z.object({
  url: z.string().trim().url(),
  titleHint: z.string().trim().optional(),
  note: z.string().trim().max(1000).optional()
});

const decisionSchema = z.object({
  reason: z.string().trim().max(1000).optional()
});

const config = loadConfig();
const store = new RequestStore(config.DATA_FILE);

const server = Fastify({
  logger: true
});

await store.init();

await server.register(cookie);
await server.register(staticPlugin, {
  root: join(dirname(fileURLToPath(import.meta.url)), '..', 'public'),
  setHeaders(response, filePath) {
    if (filePath.endsWith('index.html')) {
      response.setHeader('Cache-Control', 'no-store');
      return;
    }

    const extension = extname(filePath);
    if (extension === '.js' || extension === '.css') {
      response.setHeader('Cache-Control', 'no-cache');
    }
  }
});

server.get('/health', async () => ({ ok: true }));

server.get('/api/public-config', async () => ({
  appName: config.APP_NAME,
  allowPasswordLogin: config.ALLOW_PASSWORD_LOGIN,
  handoffEnabled: true,
  jellyfinBridgeStartUrl: config.JELLYFIN_PUBLIC_URL
    ? `${config.JELLYFIN_PUBLIC_URL}${config.JELLYFIN_BRIDGE_START_PATH}`
    : null
}));

server.get('/api/session', async (request, reply) => {
  const session = readSession(request, config);

  if (!session) {
    reply.code(401);
    return { authenticated: false };
  }

  return {
    authenticated: true,
    user: {
      userId: session.sub,
      username: session.name,
      role: session.role
    }
  };
});

server.post('/auth/login', async (request, reply) => {
  if (!config.ALLOW_PASSWORD_LOGIN) {
    reply.code(403);
    return { error: 'Password login is disabled' };
  }

  const credentials = loginSchema.parse(request.body);
  const user = await authenticateWithJellyfin({
    baseUrl: config.JELLYFIN_URL,
    username: credentials.username,
    password: credentials.password,
    appName: config.APP_NAME,
    deviceName: 'Jellytube Browser Login',
    deviceId: `jellytube-${randomUUID()}`,
    appVersion: '0.1.0'
  });

  setSession(reply, config, {
    sub: user.userId,
    name: user.username,
    role: user.role
  });

  return {
    ok: true,
    user
  };
});

server.post('/auth/logout', async (_request, reply) => {
  clearSession(reply, config);
  return { ok: true };
});

server.get('/auth/handoff', async (request, reply) => {
  const rawToken = z.string().min(1).parse((request.query as { token?: string }).token ?? '');
  const handoff = verifyHandoffToken(rawToken, config.HANDOFF_SECRET);

  setSession(reply, config, {
    sub: handoff.sub,
    name: handoff.name,
    role: handoff.role
  });

  return reply.redirect(normalizeReturnTo(handoff.returnTo) ?? '/');
});

server.get('/api/requests', async (request, reply) => {
  const user = requireUser(request, reply);

  if (!user) {
    return;
  }

  const scope = typeof request.query === 'object' && request.query && 'scope' in request.query
    ? String((request.query as Record<string, unknown>).scope ?? 'mine')
    : 'mine';

  if (scope === 'pending') {
    ensureAdmin(user, reply);
    if (reply.sent) {
      return;
    }

    return { requests: store.listPending() };
  }

  if (scope === 'all') {
    ensureAdmin(user, reply);
    if (reply.sent) {
      return;
    }

    return { requests: store.listAll() };
  }

  return { requests: store.listMine(user.userId) };
});

server.get('/api/admin/stats', async (request, reply) => {
  const user = requireUser(request, reply);

  if (!user) {
    return;
  }

  ensureAdmin(user, reply);
  if (reply.sent) {
    return;
  }

  const allRequests = store.listAll();

  return {
    counts: {
      total: allRequests.length,
      pending: allRequests.filter((requestItem) => requestItem.status === 'pending').length,
      queued: allRequests.filter((requestItem) => requestItem.status === 'queued').length,
      rejected: allRequests.filter((requestItem) => requestItem.status === 'rejected').length,
      failed: allRequests.filter((requestItem) => requestItem.status === 'failed').length
    }
  };
});

server.post('/api/requests', async (request, reply) => {
  const user = requireUser(request, reply);

  if (!user) {
    return;
  }

  const input = createRequestSchema.parse(request.body);
  const classified = classifyUrl(input.url);

  if (user.role !== 'admin' && !isAllowedHost(classified.host, config.ALLOWED_HOSTS)) {
    reply.code(403);
    return {
      error: `Host ${classified.host} is not allowed for non-admin submissions`
    };
  }

  const initialStatus: RequestStatus = config.AUTO_APPROVE_VIDEO_REQUESTS && classified.kind === 'video'
    ? 'queued'
    : 'pending';

  const created = await store.create({
    url: classified.normalizedUrl,
    titleHint: input.titleHint,
    note: input.note,
    source: classified.source,
    kind: classified.kind,
    requestedBy: user,
    status: initialStatus
  });

  if (initialStatus === 'queued') {
    try {
      const queued = await queueInMeTube(config, created.url);
      await store.update(created.id, {
        metube: {
          submittedAt: new Date().toISOString(),
          responseStatus: queued.responseStatus,
          responseSnippet: queued.responseSnippet
        }
      });
    } catch (error) {
      await store.update(created.id, {
        status: 'failed',
        metube: {
          submittedAt: new Date().toISOString(),
          responseStatus: 0,
          error: error instanceof Error ? error.message : 'Unknown MeTube error'
        }
      });
    }
  }

  return {
    request: store.get(created.id)
  };
});

server.post('/api/admin/requests/:id/approve', async (request, reply) => {
  const user = requireUser(request, reply);

  if (!user) {
    return;
  }

  ensureAdmin(user, reply);
  if (reply.sent) {
    return;
  }

  const decision = decisionSchema.parse(request.body ?? {});
  const id = z.string().uuid().parse((request.params as { id: string }).id);
  const requestItem = store.get(id);

  if (!requestItem) {
    reply.code(404);
    return { error: 'Request not found' };
  }

  try {
    const queued = await queueInMeTube(config, requestItem.url);
    await store.update(id, {
      status: 'queued',
      decision: buildDecision(user, decision.reason),
      metube: {
        submittedAt: new Date().toISOString(),
        responseStatus: queued.responseStatus,
        responseSnippet: queued.responseSnippet
      }
    });
  } catch (error) {
    await store.update(id, {
      status: 'failed',
      decision: buildDecision(user, decision.reason),
      metube: {
        submittedAt: new Date().toISOString(),
        responseStatus: 0,
        error: error instanceof Error ? error.message : 'Unknown MeTube error'
      }
    });
  }

  return {
    request: store.get(id)
  };
});

server.post('/api/admin/requests/:id/reject', async (request, reply) => {
  const user = requireUser(request, reply);

  if (!user) {
    return;
  }

  ensureAdmin(user, reply);
  if (reply.sent) {
    return;
  }

  const decision = decisionSchema.parse(request.body ?? {});
  const id = z.string().uuid().parse((request.params as { id: string }).id);
  const requestItem = store.get(id);

  if (!requestItem) {
    reply.code(404);
    return { error: 'Request not found' };
  }

  await store.update(id, {
    status: 'rejected',
    decision: buildDecision(user, decision.reason)
  });

  return {
    request: store.get(id)
  };
});

server.get('/', async (request, reply) => {
  const session = readSession(request, config);
  if (!session && !config.ALLOW_PASSWORD_LOGIN && config.JELLYFIN_PUBLIC_URL) {
    const next = new URL(`${config.JELLYFIN_PUBLIC_URL}${config.JELLYFIN_BRIDGE_START_PATH}`);
    const current = request.query as Record<string, unknown>;

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'string' && value.length > 0) {
        next.searchParams.set(key, value);
      }
    }

    return reply.redirect(next.toString());
  }

  reply.header('Cache-Control', 'no-store');
  return reply.sendFile('index.html');
});

await server.listen({
  host: config.HOST,
  port: config.PORT
});

function requireUser(request: FastifyRequest, reply: FastifyReply): JellytubeUser | null {
  const session = readSession(request, config);

  if (!session) {
    reply.code(401).send({ error: 'Authentication required' });
    return null;
  }

  return {
    userId: session.sub,
    username: session.name,
    role: session.role
  };
}

function ensureAdmin(user: JellytubeUser, reply: FastifyReply): void {
  if (user.role !== 'admin') {
    reply.code(403).send({ error: 'Administrator privileges required' });
  }
}

function buildDecision(user: JellytubeUser, reason?: string) {
  return {
    byUserId: user.userId,
    byUsername: user.username,
    decidedAt: new Date().toISOString(),
    reason
  };
}

function normalizeReturnTo(value?: string): string | null {
  if (!value) {
    return null;
  }

  return value.startsWith('/') && !value.startsWith('//') ? value : null;
}
