import { describe, expect, it } from 'vitest';

import { classifyUrl, isAllowedHost } from './classify.js';

describe('classifyUrl', () => {
  it('detects youtube videos', () => {
    expect(classifyUrl('https://www.youtube.com/watch?v=abc123')).toMatchObject({
      source: 'youtube',
      kind: 'video'
    });
  });

  it('detects youtube playlists', () => {
    expect(classifyUrl('https://www.youtube.com/playlist?list=PL123')).toMatchObject({
      source: 'youtube',
      kind: 'playlist'
    });
  });

  it('detects rumble channels', () => {
    expect(classifyUrl('https://rumble.com/c/SomeChannel')).toMatchObject({
      source: 'rumble',
      kind: 'channel'
    });
  });

  it('detects odysee channel-style urls', () => {
    expect(classifyUrl('https://odysee.com/@creator:1')).toMatchObject({
      source: 'odysee',
      kind: 'channel'
    });
  });
});

describe('isAllowedHost', () => {
  it('matches exact hosts', () => {
    expect(isAllowedHost('youtube.com', ['youtube.com'])).toBe(true);
  });

  it('matches subdomains of allowed hosts', () => {
    expect(isAllowedHost('www.youtube.com', ['youtube.com'])).toBe(true);
  });

  it('rejects unrelated hosts', () => {
    expect(isAllowedHost('example.com', ['youtube.com'])).toBe(false);
  });
});
