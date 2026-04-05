import { describe, expect, it } from 'vitest';

import { issueHandoffToken, issueSessionToken, verifyHandoffToken, verifySessionToken } from './tokens.js';

describe('session tokens', () => {
  it('round-trips a valid token', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = issueSessionToken(
      {
        sub: 'user-1',
        name: 'blitz',
        role: 'admin',
        iat: now,
        exp: now + 60
      },
      'abcdefghijklmnopqrstuvwxyz123456'
    );

    expect(verifySessionToken(token, 'abcdefghijklmnopqrstuvwxyz123456')).toMatchObject({
      sub: 'user-1',
      name: 'blitz',
      role: 'admin'
    });
  });

  it('round-trips a valid handoff token', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = issueHandoffToken(
      {
        sub: 'user-1',
        name: 'blitz',
        role: 'user',
        iat: now,
        exp: now + 60,
        jti: 'handoff-1',
        returnTo: '/?url=https%3A%2F%2Fyoutube.com'
      },
      'abcdefghijklmnopqrstuvwxyz123456'
    );

    expect(verifyHandoffToken(token, 'abcdefghijklmnopqrstuvwxyz123456')).toMatchObject({
      sub: 'user-1',
      name: 'blitz',
      role: 'user',
      returnTo: '/?url=https%3A%2F%2Fyoutube.com'
    });
  });
});
