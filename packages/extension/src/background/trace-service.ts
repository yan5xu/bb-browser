/**
 * Trace Service
 * 
 * Background 中的 trace 状态管理
 * 负责：
 * - 管理录制状态
 * - 存储录制的事件
 * - 与 content script 通信
 */

import type { TraceEvent, TraceStatus } from '@anthropic/bb-browser-shared';

// ============================================================================
// 状态管理
// ============================================================================

/** 是否正在录制 */
let isRecording = false;

/** 录制的标签页 ID */
let recordingTabId: number | null = null;

/** 录制的事件列表 */
let events: TraceEvent[] = [];

// ============================================================================
// 公共 API
// ============================================================================

/**
 * 开始录制
 */
export async function startRecording(tabId: number): Promise<void> {
  console.log('[TraceService] Starting recording on tab:', tabId);
  
  isRecording = true;
  recordingTabId = tabId;
  events = [];
  
  // 添加页面导航事件作为第一个事件
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      events.push({
        type: 'navigation',
        timestamp: Date.now(),
        url: tab.url,
        elementRole: 'document',
        elementName: tab.title || '',
        elementTag: 'document',
      });
    }
  } catch (error) {
    console.error('[TraceService] Error getting tab info:', error);
  }
  
  // 通知 content script 开始录制
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'TRACE_START' });
  } catch (error) {
    // Content script 可能尚未加载，注入它
    console.log('[TraceService] Content script not ready, will record on next event');
  }
}

/**
 * 停止录制
 */
export async function stopRecording(): Promise<TraceEvent[]> {
  console.log('[TraceService] Stopping recording, events:', events.length);
  
  const recordedEvents = [...events];
  
  // 通知 content script 停止录制
  if (recordingTabId !== null) {
    try {
      await chrome.tabs.sendMessage(recordingTabId, { type: 'TRACE_STOP' });
    } catch (error) {
      // Content script 可能已关闭
      console.log('[TraceService] Could not notify content script:', error);
    }
  }
  
  isRecording = false;
  recordingTabId = null;
  events = [];
  
  return recordedEvents;
}

/**
 * 获取录制状态
 */
export function getStatus(): TraceStatus {
  return {
    recording: isRecording,
    eventCount: events.length,
    tabId: recordingTabId ?? undefined,
  };
}

/**
 * 添加事件
 */
export function addEvent(event: TraceEvent): void {
  if (!isRecording) return;
  
  console.log('[TraceService] Adding event:', event.type, event);
  events.push(event);
}

/**
 * 检查是否正在录制
 */
export function isCurrentlyRecording(): boolean {
  return isRecording;
}

/**
 * 获取录制的标签页 ID
 */
export function getRecordingTabId(): number | null {
  return recordingTabId;
}

// ============================================================================
// 消息监听
// ============================================================================

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 处理 trace 事件
  if (message.type === 'TRACE_EVENT') {
    if (isRecording && sender.tab?.id === recordingTabId) {
      addEvent(message.payload as TraceEvent);
    }
    sendResponse({ received: true });
    return true;
  }
  
  // 处理 content script 请求录制状态
  if (message.type === 'GET_TRACE_STATUS') {
    sendResponse({
      recording: isRecording && sender.tab?.id === recordingTabId,
      tabId: recordingTabId,
    });
    return true;
  }
  
  return false;
});

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId) {
    console.log('[TraceService] Recording tab closed, stopping recording');
    isRecording = false;
    recordingTabId = null;
    // 不清空 events，以便用户可以恢复
  }
});

// 监听标签页导航事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
  if (tabId === recordingTabId && isRecording && changeInfo.url) {
    // 记录导航事件
    events.push({
      type: 'navigation',
      timestamp: Date.now(),
      url: changeInfo.url,
      elementRole: 'document',
      elementName: _tab.title || '',
      elementTag: 'document',
    });
    console.log('[TraceService] Navigation event:', changeInfo.url);
  }
});

console.log('[TraceService] Initialized');
