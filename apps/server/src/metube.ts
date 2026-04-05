import type { AppConfig } from './config.js';

export interface MeTubeQueueResult {
  responseStatus: number;
  responseSnippet?: string;
}

export async function queueInMeTube(config: Pick<AppConfig, 'METUBE_URL' | 'DEFAULT_QUALITY'>, url: string): Promise<MeTubeQueueResult> {
  const response = await fetch(`${config.METUBE_URL}/add`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      quality: config.DEFAULT_QUALITY
    })
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`MeTube responded with ${response.status}: ${responseText.slice(0, 300)}`);
  }

  return {
    responseStatus: response.status,
    responseSnippet: responseText.slice(0, 300)
  };
}
