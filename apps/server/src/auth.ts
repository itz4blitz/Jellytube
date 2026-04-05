import type { JellytubeUser } from './types.js';

interface JellyfinAuthenticateResponse {
  User?: {
    Id?: string;
    Name?: string;
    Policy?: {
      IsAdministrator?: boolean;
    };
  };
}

export async function authenticateWithJellyfin(options: {
  baseUrl: string;
  username: string;
  password: string;
  appName: string;
  deviceName: string;
  deviceId: string;
  appVersion: string;
}): Promise<JellytubeUser> {
  const response = await fetch(`${options.baseUrl}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Emby-Authorization': `MediaBrowser Client="${options.appName}", Device="${options.deviceName}", DeviceId="${options.deviceId}", Version="${options.appVersion}"`
    },
    body: JSON.stringify({
      Username: options.username,
      Pw: options.password
    })
  });

  if (!response.ok) {
    throw new Error('Invalid Jellyfin credentials');
  }

  const json = (await response.json()) as JellyfinAuthenticateResponse;

  if (!json.User?.Id || !json.User.Name) {
    throw new Error('Jellyfin returned an incomplete auth response');
  }

  return {
    userId: json.User.Id,
    username: json.User.Name,
    role: json.User.Policy?.IsAdministrator === true ? 'admin' : 'user'
  };
}
