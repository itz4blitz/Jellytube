export type UserRole = 'admin' | 'user';

export type RequestKind = 'video' | 'playlist' | 'channel' | 'unknown';

export type RequestSource = 'youtube' | 'rumble' | 'odysee' | 'generic';

export type RequestStatus = 'pending' | 'queued' | 'rejected' | 'failed';

export interface JellytubeUser {
  userId: string;
  username: string;
  role: UserRole;
}

export interface MeTubeSubmissionResult {
  submittedAt: string;
  responseStatus: number;
  responseSnippet?: string;
  error?: string;
}

export interface RequestDecision {
  byUserId: string;
  byUsername: string;
  decidedAt: string;
  reason?: string;
}

export interface JellytubeRequest {
  id: string;
  url: string;
  titleHint?: string;
  note?: string;
  source: RequestSource;
  kind: RequestKind;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  requestedBy: JellytubeUser;
  decision?: RequestDecision;
  metube?: MeTubeSubmissionResult;
}
