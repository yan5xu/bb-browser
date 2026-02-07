/**
 * bb-browser Background Service Worker
 *
 * 负责：
 * - 通过 SSE 连接 Daemon 接收命令
 * - 协调 Content Scripts
 * - 管理扩展状态
 * - 使用 chrome.alarms 保持 Service Worker 活跃
 */

import { SSEClient } from './sse-client';
import { handleCommand } from './command-handler';

// 保活 Alarm 名称
const KEEPALIVE_ALARM = 'bb-browser-keepalive';

// 创建 SSE 客户端
const sseClient = new SSEClient();

// 注册命令处理器
sseClient.onCommand(handleCommand);

// 监听上游 URL 变更，立即重连
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.upstreamUrl) {
    const newUrl = changes.upstreamUrl.newValue || 'default';
    console.log('[bb-browser] Upstream URL changed to:', newUrl, '— reconnecting...');
    sseClient.disconnect();
    sseClient.connect();
  }
});

// 监听来自 Content Script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[bb-browser] Message from content script:', message, 'sender:', sender.tab?.id);
  sendResponse({ received: true });
  return true;
});

// 设置保活 Alarm（每 25 秒触发一次，防止 Service Worker 休眠）
async function setupKeepaliveAlarm() {
  // 先清除可能存在的旧 alarm
  await chrome.alarms.clear(KEEPALIVE_ALARM);
  
  // 创建新的 alarm，periodInMinutes 最小值是 0.5（30秒），但我们可以用更短的
  // MV3 允许 periodInMinutes >= 0.5，但 delayInMinutes 可以更短
  // 使用 0.4 分钟 = 24 秒
  await chrome.alarms.create(KEEPALIVE_ALARM, {
    periodInMinutes: 0.4, // 24 秒
  });
  
  console.log('[bb-browser] Keepalive alarm set (every 24s)');
}

// Alarm 触发时检查并重连
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    console.log('[bb-browser] Keepalive alarm triggered, checking connection...');
    
    // 检查 SSE 连接状态，如果断开则重连
    if (!sseClient.isConnected()) {
      console.log('[bb-browser] SSE disconnected, reconnecting...');
      sseClient.connect();
    }
  }
});

// 扩展安装/更新事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[bb-browser] Extension installed/updated:', details.reason);
  // 安装后自动连接
  sseClient.connect();
  setupKeepaliveAlarm();
});

// Service Worker 启动时连接
chrome.runtime.onStartup.addListener(() => {
  console.log('[bb-browser] Browser started, connecting to daemon...');
  sseClient.connect();
  setupKeepaliveAlarm();
});

// 立即尝试连接（处理扩展重载的情况）
console.log('[bb-browser] Background service worker started, connecting to daemon...');
sseClient.connect();
setupKeepaliveAlarm();
