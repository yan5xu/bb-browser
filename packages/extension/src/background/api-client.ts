/**
 * API Client for bb-browser Extension
 * 负责向 Daemon 回传命令执行结果
 */

import { getUpstreamUrl } from './constants';

export interface CommandResult {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * 向 Daemon 发送命令执行结果
 */
export async function sendResult(result: CommandResult): Promise<void> {
  const baseUrl = await getUpstreamUrl();
  const url = `${baseUrl}/result`;
  console.log('[APIClient] Sending result:', result.id, result.success);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      console.error('[APIClient] Failed to send result:', response.status, response.statusText);
      return;
    }

    const data = await response.json();
    console.log('[APIClient] Result sent successfully:', data);
  } catch (error) {
    console.error('[APIClient] Error sending result:', error);
  }
}
