import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { JellytubeRequest, JellytubeUser, RequestDecision, RequestStatus } from './types.js';

interface StoreFile {
  version: 1;
  requests: JellytubeRequest[];
}

export class RequestStore {
  private file: StoreFile = { version: 1, requests: [] };

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.file = parseStore(raw);
    } catch {
      await this.save();
    }
  }

  listAll(): JellytubeRequest[] {
    return [...this.file.requests].sort(sortNewestFirst);
  }

  listMine(userId: string): JellytubeRequest[] {
    return this.file.requests.filter((request) => request.requestedBy.userId === userId).sort(sortNewestFirst);
  }

  listPending(): JellytubeRequest[] {
    return this.file.requests.filter((request) => request.status === 'pending').sort(sortNewestFirst);
  }

  get(id: string): JellytubeRequest | null {
    return this.file.requests.find((request) => request.id === id) ?? null;
  }

  async create(input: {
    url: string;
    titleHint?: string;
    note?: string;
    source: JellytubeRequest['source'];
    kind: JellytubeRequest['kind'];
    requestedBy: JellytubeUser;
    status: RequestStatus;
  }): Promise<JellytubeRequest> {
    const now = new Date().toISOString();
    const request: JellytubeRequest = {
      id: randomUUID(),
      url: input.url,
      titleHint: input.titleHint,
      note: input.note,
      source: input.source,
      kind: input.kind,
      status: input.status,
      createdAt: now,
      updatedAt: now,
      requestedBy: input.requestedBy
    };

    this.file.requests.push(request);
    await this.save();
    return request;
  }

  async update(id: string, patch: Partial<JellytubeRequest>): Promise<JellytubeRequest> {
    const current = this.get(id);

    if (!current) {
      throw new Error(`Request ${id} was not found`);
    }

    Object.assign(current, patch, { updatedAt: new Date().toISOString() });
    await this.save();
    return current;
  }

  async recordDecision(id: string, decision: RequestDecision, status: RequestStatus): Promise<JellytubeRequest> {
    return this.update(id, {
      decision,
      status
    });
  }

  private async save(): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(this.file, null, 2));
    await rename(tempPath, this.filePath);
  }
}

function parseStore(raw: string): StoreFile {
  const parsed = JSON.parse(raw) as Partial<StoreFile>;

  return {
    version: 1,
    requests: Array.isArray(parsed.requests) ? parsed.requests : []
  };
}

function sortNewestFirst(a: JellytubeRequest, b: JellytubeRequest): number {
  return b.createdAt.localeCompare(a.createdAt);
}
