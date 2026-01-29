/**
 * Command Handler for bb-browser Extension
 * 处理从 Daemon 接收的命令
 */

import { sendResult, CommandResult } from './api-client';
import { CommandEvent } from './sse-client';
import { getSnapshot, clickElement, fillElement } from './dom-service';

/**
 * 处理收到的命令
 */
export async function handleCommand(command: CommandEvent): Promise<void> {
  console.log('[CommandHandler] Processing command:', command.id, command.action);

  let result: CommandResult;

  try {
    switch (command.action) {
      case 'open':
        result = await handleOpen(command);
        break;

      case 'snapshot':
        result = await handleSnapshot(command);
        break;

      case 'click':
        result = await handleClick(command);
        break;

      case 'fill':
        result = await handleFill(command);
        break;

      case 'screenshot':
        result = await handleScreenshot(command);
        break;

      default:
        result = {
          id: command.id,
          success: false,
          error: `Unknown action: ${command.action}`,
        };
    }
  } catch (error) {
    result = {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  await sendResult(result);
}

/**
 * 处理 open 命令 - 打开新标签页
 */
async function handleOpen(command: CommandEvent): Promise<CommandResult> {
  const url = command.url as string;

  if (!url) {
    return {
      id: command.id,
      success: false,
      error: 'Missing url parameter',
    };
  }

  console.log('[CommandHandler] Opening URL:', url);

  const tab = await chrome.tabs.create({ url, active: true });

  // 等待页面加载完成
  await waitForTabLoad(tab.id!);

  // 获取页面信息
  const updatedTab = await chrome.tabs.get(tab.id!);

  return {
    id: command.id,
    success: true,
    data: {
      tabId: tab.id,
      title: updatedTab.title || '',
      url: updatedTab.url || url,
    },
  };
}

/**
 * 处理 snapshot 命令 - 获取页面快照
 * 使用 DOM Service 注入 buildDomTree 脚本并获取可访问性树
 */
async function handleSnapshot(command: CommandEvent): Promise<CommandResult> {
  // 获取当前活动标签页
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: 'No active tab found',
    };
  }

  // 检查是否是特殊页面（chrome:// 或 about:）
  const url = activeTab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) {
    return {
      id: command.id,
      success: false,
      error: `Cannot take snapshot of restricted page: ${url}`,
    };
  }

  // 获取 interactive 参数，默认 false（完整树模式）
  const interactive = command.interactive as boolean | undefined;

  console.log('[CommandHandler] Taking snapshot of tab:', activeTab.id, activeTab.url, { interactive });

  try {
    // 使用 DOM Service 获取快照
    const snapshotResult = await getSnapshot(activeTab.id, { interactive });

    return {
      id: command.id,
      success: true,
      data: {
        title: activeTab.title || '',
        url: activeTab.url || '',
        snapshotData: snapshotResult,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Snapshot failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Snapshot failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 click 命令 - 点击元素
 */
async function handleClick(command: CommandEvent): Promise<CommandResult> {
  const ref = command.ref as string;

  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: 'Missing ref parameter',
    };
  }

  // 获取当前活动标签页
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: 'No active tab found',
    };
  }

  console.log('[CommandHandler] Clicking element:', ref);

  try {
    const elementInfo = await clickElement(activeTab.id, ref);

    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Click failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Click failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 fill 命令 - 填充输入框
 */
async function handleFill(command: CommandEvent): Promise<CommandResult> {
  const ref = command.ref as string;
  const text = command.text as string;

  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: 'Missing ref parameter',
    };
  }

  if (text === undefined || text === null) {
    return {
      id: command.id,
      success: false,
      error: 'Missing text parameter',
    };
  }

  // 获取当前活动标签页
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: 'No active tab found',
    };
  }

  console.log('[CommandHandler] Filling element:', ref, 'with text length:', text.length);

  try {
    const elementInfo = await fillElement(activeTab.id, ref, text);

    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
        filledText: text,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Fill failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Fill failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 screenshot 命令 - 截取当前页面
 */
async function handleScreenshot(command: CommandEvent): Promise<CommandResult> {
  // 获取当前活动标签页
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id || !activeTab.windowId) {
    return {
      id: command.id,
      success: false,
      error: 'No active tab found',
    };
  }

  console.log('[CommandHandler] Taking screenshot of tab:', activeTab.id, activeTab.url);

  try {
    // 使用 chrome.tabs.captureVisibleTab 截图
    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' });

    return {
      id: command.id,
      success: true,
      data: {
        dataUrl,
        title: activeTab.title || '',
        url: activeTab.url || '',
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Screenshot failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 等待标签页加载完成
 */
function waitForTabLoad(tabId: number, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, timeout);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}
