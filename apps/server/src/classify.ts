import type { RequestKind, RequestSource } from './types.js';

export interface ClassifiedUrl {
  normalizedUrl: string;
  host: string;
  source: RequestSource;
  kind: RequestKind;
}

export function classifyUrl(input: string): ClassifiedUrl {
  const url = new URL(input.trim());
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname;
  const normalizedUrl = url.toString();

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    return {
      normalizedUrl,
      host,
      source: 'youtube',
      kind: classifyYouTube(url, host, path)
    };
  }

  if (host === 'rumble.com') {
    return {
      normalizedUrl,
      host,
      source: 'rumble',
      kind: /^\/(c|user)\//.test(path) ? 'channel' : 'video'
    };
  }

  if (host === 'odysee.com') {
    return {
      normalizedUrl,
      host,
      source: 'odysee',
      kind: path.startsWith('/@') ? 'channel' : 'video'
    };
  }

  return {
    normalizedUrl,
    host,
    source: 'generic',
    kind: 'unknown'
  };
}

export function isAllowedHost(host: string, allowedHosts: string[]): boolean {
  const normalized = host.toLowerCase().replace(/^www\./, '');
  return allowedHosts.some((allowedHost) => normalized === allowedHost || normalized.endsWith(`.${allowedHost}`));
}

function classifyYouTube(url: URL, host: string, path: string): RequestKind {
  if (host === 'youtu.be') {
    return 'video';
  }

  if (path === '/playlist' || (url.searchParams.has('list') && !url.searchParams.has('v'))) {
    return 'playlist';
  }

  if (path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/user/') || path.startsWith('/c/')) {
    return 'channel';
  }

  if (url.searchParams.has('v') || path.startsWith('/watch') || path.startsWith('/shorts/')) {
    return 'video';
  }

  return 'unknown';
}
