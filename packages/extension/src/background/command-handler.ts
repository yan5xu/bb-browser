/**
 * Command Handler for bb-browser Extension
 * 处理从 Daemon 接收的命令
 */

import { sendResult, CommandResult } from './api-client';
import { CommandEvent } from './sse-client';
import { getSnapshot, clickElement, hoverElement, fillElement, typeElement, getElementText, waitForElement, checkElement, uncheckElement, selectOption } from './dom-service';

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

      case 'hover':
        result = await handleHover(command);
        break;

      case 'fill':
        result = await handleFill(command);
        break;

      case 'type':
        result = await handleType(command);
        break;

      case 'check':
        result = await handleCheck(command);
        break;

      case 'uncheck':
        result = await handleUncheck(command);
        break;

      case 'close':
        result = await handleClose(command);
        break;

      case 'get':
        result = await handleGet(command);
        break;

      case 'screenshot':
        result = await handleScreenshot(command);
        break;

      case 'wait':
        result = await handleWait(command);
        break;

      case 'press':
        result = await handlePress(command);
        break;

      case 'scroll':
        result = await handleScroll(command);
        break;

      case 'back':
        result = await handleBack(command);
        break;

      case 'forward':
        result = await handleForward(command);
        break;

      case 'refresh':
        result = await handleRefresh(command);
        break;

      case 'eval':
        result = await handleEval(command);
        break;

      case 'select':
        result = await handleSelect(command);
        break;

      case 'dialog':
        result = await handleDialog(command);
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
 * 处理 hover 命令 - 悬停在元素上
 */
async function handleHover(command: CommandEvent): Promise<CommandResult> {
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

  console.log('[CommandHandler] Hovering element:', ref);

  try {
    const elementInfo = await hoverElement(activeTab.id, ref);

    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Hover failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Hover failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * 处理 type 命令 - 逐字符输入文本（不清空原有内容）
 */
async function handleType(command: CommandEvent): Promise<CommandResult> {
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

  console.log('[CommandHandler] Typing in element:', ref, 'text length:', text.length);

  try {
    const elementInfo = await typeElement(activeTab.id, ref, text);

    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
        typedText: text,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Type failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Type failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 check 命令 - 勾选复选框
 */
async function handleCheck(command: CommandEvent): Promise<CommandResult> {
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

  console.log('[CommandHandler] Checking element:', ref);

  try {
    const elementInfo = await checkElement(activeTab.id, ref);

    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
        wasAlreadyChecked: elementInfo.wasAlreadyChecked,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Check failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 uncheck 命令 - 取消勾选复选框
 */
async function handleUncheck(command: CommandEvent): Promise<CommandResult> {
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

  console.log('[CommandHandler] Unchecking element:', ref);

  try {
    const elementInfo = await uncheckElement(activeTab.id, ref);

    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
        wasAlreadyUnchecked: elementInfo.wasAlreadyUnchecked,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Uncheck failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Uncheck failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 select 命令 - 下拉框选择
 */
async function handleSelect(command: CommandEvent): Promise<CommandResult> {
  const ref = command.ref as string;
  const value = command.value as string;

  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: 'Missing ref parameter',
    };
  }

  if (value === undefined || value === null) {
    return {
      id: command.id,
      success: false,
      error: 'Missing value parameter',
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

  console.log('[CommandHandler] Selecting option:', ref, 'value:', value);

  try {
    const result = await selectOption(activeTab.id, ref, value);

    return {
      id: command.id,
      success: true,
      data: {
        role: result.role,
        name: result.name,
        selectedValue: result.selectedValue,
        selectedLabel: result.selectedLabel,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Select failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Select failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 close 命令 - 关闭当前标签页
 */
async function handleClose(command: CommandEvent): Promise<CommandResult> {
  // 获取当前活动标签页
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: 'No active tab found',
    };
  }

  const tabId = activeTab.id;
  const title = activeTab.title || '';
  const url = activeTab.url || '';

  console.log('[CommandHandler] Closing tab:', tabId, url);

  try {
    await chrome.tabs.remove(tabId);

    return {
      id: command.id,
      success: true,
      data: {
        tabId,
        title,
        url,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Close failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Close failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 get 命令 - 获取页面或元素信息
 */
async function handleGet(command: CommandEvent): Promise<CommandResult> {
  const attribute = command.attribute as string;

  if (!attribute) {
    return {
      id: command.id,
      success: false,
      error: 'Missing attribute parameter',
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

  console.log('[CommandHandler] Getting:', attribute);

  try {
    let value: string;

    switch (attribute) {
      case 'url':
        value = activeTab.url || '';
        break;

      case 'title':
        value = activeTab.title || '';
        break;

      case 'text': {
        const ref = command.ref as string;
        if (!ref) {
          return {
            id: command.id,
            success: false,
            error: 'Missing ref parameter for get text',
          };
        }
        value = await getElementText(activeTab.id, ref);
        break;
      }

      default:
        return {
          id: command.id,
          success: false,
          error: `Unknown attribute: ${attribute}`,
        };
    }

    return {
      id: command.id,
      success: true,
      data: {
        value,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Get failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Get failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * 处理 wait 命令 - 等待时间或元素
 */
async function handleWait(command: CommandEvent): Promise<CommandResult> {
  const waitType = command.waitType as string;

  if (waitType === 'time') {
    // 等待指定时间
    const ms = command.ms as number;
    if (!ms || ms < 0) {
      return {
        id: command.id,
        success: false,
        error: 'Invalid ms parameter',
      };
    }

    console.log('[CommandHandler] Waiting for', ms, 'ms');
    await new Promise(resolve => setTimeout(resolve, ms));

    return {
      id: command.id,
      success: true,
      data: { waited: ms },
    };
  } else if (waitType === 'element') {
    // 等待元素出现
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

    console.log('[CommandHandler] Waiting for element:', ref);

    try {
      await waitForElement(activeTab.id, ref);
      return {
        id: command.id,
        success: true,
        data: { ref },
      };
    } catch (error) {
      console.error('[CommandHandler] Wait failed:', error);
      return {
        id: command.id,
        success: false,
        error: `Wait failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } else {
    return {
      id: command.id,
      success: false,
      error: `Unknown wait type: ${waitType}`,
    };
  }
}

/**
 * 处理 press 命令 - 发送键盘按键
 */
async function handlePress(command: CommandEvent): Promise<CommandResult> {
  const key = command.key as string;
  const modifiers = (command.modifiers as string[]) || [];

  if (!key) {
    return {
      id: command.id,
      success: false,
      error: 'Missing key parameter',
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

  // 检查是否是特殊页面
  const url = activeTab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) {
    return {
      id: command.id,
      success: false,
      error: `Cannot send keys to restricted page: ${url}`,
    };
  }

  console.log('[CommandHandler] Pressing key:', key, 'modifiers:', modifiers);

  try {
    // 使用 content script 模拟键盘事件
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (key: string, modifiers: string[]) => {
        const el = document.activeElement || document.body;
        
        const eventInit: KeyboardEventInit = {
          key,
          code: key,
          bubbles: true,
          cancelable: true,
          ctrlKey: modifiers.includes('Control'),
          altKey: modifiers.includes('Alt'),
          shiftKey: modifiers.includes('Shift'),
          metaKey: modifiers.includes('Meta'),
        };

        // 发送 keydown 和 keyup 事件
        el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        el.dispatchEvent(new KeyboardEvent('keyup', eventInit));

        // 对于 Enter 键，额外触发 keypress 事件（某些网站需要）
        if (key === 'Enter') {
          el.dispatchEvent(new KeyboardEvent('keypress', eventInit));
        }
      },
      args: [key, modifiers],
    });

    const displayKey = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;

    return {
      id: command.id,
      success: true,
      data: {
        key: displayKey,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Press failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Press failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 scroll 命令 - 滚动页面
 */
async function handleScroll(command: CommandEvent): Promise<CommandResult> {
  const direction = command.direction as string;
  const pixels = (command.pixels as number) || 300;

  if (!direction) {
    return {
      id: command.id,
      success: false,
      error: 'Missing direction parameter',
    };
  }

  if (!['up', 'down', 'left', 'right'].includes(direction)) {
    return {
      id: command.id,
      success: false,
      error: `Invalid direction: ${direction}`,
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

  console.log('[CommandHandler] Scrolling:', direction, pixels, 'px');

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (dir: string, px: number) => {
        switch (dir) {
          case 'up': window.scrollBy(0, -px); break;
          case 'down': window.scrollBy(0, px); break;
          case 'left': window.scrollBy(-px, 0); break;
          case 'right': window.scrollBy(px, 0); break;
        }
      },
      args: [direction, pixels],
    });

    return {
      id: command.id,
      success: true,
      data: {
        direction,
        pixels,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Scroll failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Scroll failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 back 命令 - 后退
 */
async function handleBack(command: CommandEvent): Promise<CommandResult> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: 'No active tab found',
    };
  }

  console.log('[CommandHandler] Going back in tab:', activeTab.id);

  try {
    await chrome.tabs.goBack(activeTab.id);
    await waitForTabLoad(activeTab.id);
    const updatedTab = await chrome.tabs.get(activeTab.id);

    return {
      id: command.id,
      success: true,
      data: {
        url: updatedTab.url || '',
        title: updatedTab.title || '',
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Back failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Back failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 forward 命令 - 前进
 */
async function handleForward(command: CommandEvent): Promise<CommandResult> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: 'No active tab found',
    };
  }

  console.log('[CommandHandler] Going forward in tab:', activeTab.id);

  try {
    await chrome.tabs.goForward(activeTab.id);
    await waitForTabLoad(activeTab.id);
    const updatedTab = await chrome.tabs.get(activeTab.id);

    return {
      id: command.id,
      success: true,
      data: {
        url: updatedTab.url || '',
        title: updatedTab.title || '',
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Forward failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Forward failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 refresh 命令 - 刷新页面
 */
async function handleRefresh(command: CommandEvent): Promise<CommandResult> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: 'No active tab found',
    };
  }

  console.log('[CommandHandler] Refreshing tab:', activeTab.id);

  try {
    await chrome.tabs.reload(activeTab.id);
    await waitForTabLoad(activeTab.id);
    const updatedTab = await chrome.tabs.get(activeTab.id);

    return {
      id: command.id,
      success: true,
      data: {
        url: updatedTab.url || '',
        title: updatedTab.title || '',
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Refresh failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 eval 命令 - 在页面执行 JavaScript
 */
async function handleEval(command: CommandEvent): Promise<CommandResult> {
  const script = command.script as string;

  if (!script) {
    return {
      id: command.id,
      success: false,
      error: 'Missing script parameter',
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

  // 检查是否是特殊页面
  const url = activeTab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) {
    return {
      id: command.id,
      success: false,
      error: `Cannot execute script on restricted page: ${url}`,
    };
  }

  console.log('[CommandHandler] Evaluating script:', script.substring(0, 100));

  try {
    // 使用 chrome.scripting.executeScript 执行用户脚本
    // 注意：需要指定 world: 'MAIN' 才能访问页面的 document 等全局对象
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      world: 'MAIN', // 在主页面上下文中执行，可访问 document, window 等
      func: (code: string) => {
        // 直接使用 eval 执行代码
        // 返回值必须是可序列化的
        try {
          return eval(code);
        } catch (e) {
          // 如果直接 eval 失败（比如语句而非表达式），尝试用 Function
          const fn = new Function(code);
          return fn();
        }
      },
      args: [script],
    });

    // 获取执行结果
    const result = results[0]?.result;

    return {
      id: command.id,
      success: true,
      data: {
        result,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Eval failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Eval failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Dialog 状态管理
 * 存储每个 tab 的待处理 dialog 信息
 */
interface PendingDialog {
  url: string;
  message: string;
  type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  defaultPrompt?: string;
  hasBrowserHandler: boolean;
}

// 每个 tab 的待处理 dialog
const pendingDialogs: Map<number, PendingDialog> = new Map();

// 已 attach debugger 的 tab
const debuggerAttachedTabs: Set<number> = new Set();

/**
 * 处理 debugger 事件
 */
function onDebuggerEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params?: object
): void {
  if (method === 'Page.javascriptDialogOpening' && source.tabId) {
    const dialogParams = params as {
      url: string;
      message: string;
      type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
      defaultPrompt?: string;
      hasBrowserHandler: boolean;
    };
    console.log('[CommandHandler] Dialog opened:', dialogParams);
    pendingDialogs.set(source.tabId, dialogParams);
  } else if (method === 'Page.javascriptDialogClosed' && source.tabId) {
    console.log('[CommandHandler] Dialog closed');
    pendingDialogs.delete(source.tabId);
  }
}

// 注册全局 debugger 事件监听器
chrome.debugger.onEvent.addListener(onDebuggerEvent);

// 当 tab 关闭时清理状态
chrome.tabs.onRemoved.addListener((tabId) => {
  pendingDialogs.delete(tabId);
  if (debuggerAttachedTabs.has(tabId)) {
    debuggerAttachedTabs.delete(tabId);
  }
});

// 当 debugger 被 detach 时清理状态
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    debuggerAttachedTabs.delete(source.tabId);
    pendingDialogs.delete(source.tabId);
  }
});

/**
 * 确保 debugger 已附加到 tab
 */
async function ensureDebuggerAttached(tabId: number): Promise<void> {
  if (debuggerAttachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    debuggerAttachedTabs.add(tabId);
    
    // 启用 Page 域以接收 dialog 事件
    await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
    console.log('[CommandHandler] Debugger attached to tab:', tabId);
  } catch (error) {
    // 如果已经 attached，忽略错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('Another debugger is already attached')) {
      throw error;
    }
    debuggerAttachedTabs.add(tabId);
  }
}

/**
 * 处理 dialog 命令 - 接受或拒绝对话框
 */
async function handleDialog(command: CommandEvent): Promise<CommandResult> {
  const dialogResponse = command.dialogResponse as 'accept' | 'dismiss';
  const promptText = command.promptText as string | undefined;

  if (!dialogResponse || !['accept', 'dismiss'].includes(dialogResponse)) {
    return {
      id: command.id,
      success: false,
      error: 'Missing or invalid dialogResponse parameter (accept/dismiss)',
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

  const tabId = activeTab.id;

  console.log('[CommandHandler] Handling dialog:', dialogResponse, 'promptText:', promptText);

  try {
    // 确保 debugger 已附加
    await ensureDebuggerAttached(tabId);

    // 检查是否有待处理的 dialog
    const pendingDialog = pendingDialogs.get(tabId);

    if (!pendingDialog) {
      return {
        id: command.id,
        success: false,
        error: '没有待处理的对话框',
      };
    }

    // 处理 dialog
    await chrome.debugger.sendCommand({ tabId }, 'Page.handleJavaScriptDialog', {
      accept: dialogResponse === 'accept',
      promptText: dialogResponse === 'accept' ? promptText : undefined,
    });

    // 获取 dialog 信息后清理
    const dialogInfo = {
      type: pendingDialog.type,
      message: pendingDialog.message,
      handled: true,
    };

    pendingDialogs.delete(tabId);

    return {
      id: command.id,
      success: true,
      data: {
        dialogInfo,
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Dialog handling failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Dialog failed: ${error instanceof Error ? error.message : String(error)}`,
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
