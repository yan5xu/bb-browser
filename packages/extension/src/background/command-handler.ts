/**
 * Command Handler for bb-browser Extension
 * 处理从 Daemon 接收的命令
 */

import { sendResult, CommandResult } from './api-client';
import { CommandEvent } from './sse-client';
import { getSnapshot, clickElement, hoverElement, fillElement, typeElement, getElementText, waitForElement, checkElement, uncheckElement, selectOption, setActiveFrameId } from './dom-service';

/**
 * 当前活动 Frame 的 frameId
 * null 表示主 frame，数字表示子 frame 的 frameId
 * 用于 handleFrame 内部逻辑，DOM 操作使用 dom-service 的 activeFrameId
 */
let activeFrameId: number | null = null;

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

      case 'frame':
        result = await handleFrame(command);
        break;

      case 'frame_main':
        result = await handleFrameMain(command);
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
 * 处理 frame 命令 - 切换到指定 iframe
 */
async function handleFrame(command: CommandEvent): Promise<CommandResult> {
  const selector = command.selector as string;

  if (!selector) {
    return {
      id: command.id,
      success: false,
      error: 'Missing selector parameter',
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

  console.log('[CommandHandler] Switching to frame:', selector);

  try {
    // 1. 在页面中找到 iframe 元素并获取其信息
    const iframeInfoResults = await chrome.scripting.executeScript({
      target: { tabId, frameIds: activeFrameId !== null ? [activeFrameId] : [0] },
      func: (sel: string) => {
        const iframe = document.querySelector(sel) as HTMLIFrameElement | null;
        if (!iframe) {
          return { found: false, error: `找不到 iframe: ${sel}` };
        }
        if (iframe.tagName.toLowerCase() !== 'iframe' && iframe.tagName.toLowerCase() !== 'frame') {
          return { found: false, error: `元素不是 iframe: ${iframe.tagName}` };
        }
        return {
          found: true,
          name: iframe.name || '',
          src: iframe.src || '',
          // 获取 iframe 在页面中的位置用于匹配
          rect: iframe.getBoundingClientRect(),
        };
      },
      args: [selector],
    });

    const iframeInfo = iframeInfoResults[0]?.result as {
      found: boolean;
      error?: string;
      name?: string;
      src?: string;
      rect?: DOMRect;
    };

    if (!iframeInfo || !iframeInfo.found) {
      return {
        id: command.id,
        success: false,
        error: iframeInfo?.error || `找不到 iframe: ${selector}`,
      };
    }

    // 2. 获取所有 frames
    const frames = await chrome.webNavigation.getAllFrames({ tabId });

    if (!frames || frames.length === 0) {
      return {
        id: command.id,
        success: false,
        error: '无法获取页面 frames',
      };
    }

    // 3. 尝试通过 URL 或 name 匹配 frameId
    let targetFrameId: number | null = null;

    // 首先尝试通过 src URL 匹配
    if (iframeInfo.src) {
      const matchedFrame = frames.find(f => 
        f.url === iframeInfo.src || 
        f.url.includes(iframeInfo.src!) ||
        iframeInfo.src!.includes(f.url)
      );
      if (matchedFrame) {
        targetFrameId = matchedFrame.frameId;
      }
    }

    // 如果没有匹配到，尝试通过非主 frame 排除
    if (targetFrameId === null) {
      // 获取非主 frame 的列表（排除 frameId 为 0 的主 frame）
      const childFrames = frames.filter(f => f.frameId !== 0);
      
      if (childFrames.length === 1) {
        // 只有一个子 frame，直接使用它
        targetFrameId = childFrames[0].frameId;
      } else if (childFrames.length > 1) {
        // 多个子 frame，尝试用 name 匹配
        if (iframeInfo.name) {
          // 目前无法直接通过 name 匹配，需要更复杂的逻辑
          // 暂时使用第一个匹配 URL 的 frame
          console.log('[CommandHandler] Multiple frames found, using URL matching');
        }
        
        // 如果还是没找到，返回错误
        if (targetFrameId === null) {
          return {
            id: command.id,
            success: false,
            error: `找到多个子 frame，无法确定目标。请使用更精确的 selector 或确保 iframe 有 src 属性。`,
          };
        }
      } else {
        return {
          id: command.id,
          success: false,
          error: '页面中没有子 frame',
        };
      }
    }

    // 4. 验证 frameId 是否有效（尝试在该 frame 中执行脚本）
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [targetFrameId] },
        func: () => true,
      });
    } catch (e) {
      return {
        id: command.id,
        success: false,
        error: `无法访问 frame (frameId: ${targetFrameId})，可能是跨域 iframe`,
      };
    }

    // 5. 保存 activeFrameId 并同步到 dom-service
    activeFrameId = targetFrameId;
    setActiveFrameId(targetFrameId);

    const matchedFrameInfo = frames.find(f => f.frameId === targetFrameId);

    return {
      id: command.id,
      success: true,
      data: {
        frameInfo: {
          selector,
          name: iframeInfo.name,
          url: matchedFrameInfo?.url || iframeInfo.src,
          frameId: targetFrameId,
        },
      },
    };
  } catch (error) {
    console.error('[CommandHandler] Frame switch failed:', error);
    return {
      id: command.id,
      success: false,
      error: `Frame switch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 处理 frame_main 命令 - 返回主 frame
 */
async function handleFrameMain(command: CommandEvent): Promise<CommandResult> {
  console.log('[CommandHandler] Switching to main frame');

  // 重置 activeFrameId 并同步到 dom-service
  activeFrameId = null;
  setActiveFrameId(null);

  return {
    id: command.id,
    success: true,
    data: {
      frameInfo: {
        frameId: 0,
      },
    },
  };
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
