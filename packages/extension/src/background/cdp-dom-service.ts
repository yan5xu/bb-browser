/**
 * CDP DOM Service for bb-browser Extension
 * 
 * 使用 CDP 协议实现 DOM 操作，替代 Content Script 注入方式。
 * 
 * 主要功能：
 * - snapshot: 使用 Runtime.evaluate + buildDomTree（通过 CDP 注入）
 * - click/hover: 使用 DOM.getBoxModel + Input.dispatchMouseEvent
 * - fill/type: 使用 Input.insertText
 * - get text: 使用 Runtime.callFunctionOn
 */

import * as cdp from './cdp-service';
// 暂时复用原有的 snapshot 实现（使用 chrome.scripting.executeScript）
import { getSnapshot as legacyGetSnapshot, getRefInfo as legacyGetRefInfo, type RefInfo as LegacyRefInfo, type SnapshotResult as LegacySnapshotResult } from './dom-service';

// ============================================================================
// 类型定义
// ============================================================================

/** Ref 元素信息 - 使用 xpath 定位（兼容旧实现） */
export interface RefInfo {
  xpath: string;
  role: string;
  name?: string;
  tagName?: string;
}

/** Snapshot 结果 */
export interface SnapshotResult {
  snapshot: string;
  refs: Record<string, RefInfo>;
}

/** Snapshot 选项 */
export interface SnapshotOptions {
  /** 是否只输出可交互元素，默认 false */
  interactive?: boolean;
}

// ============================================================================
// 状态管理（使用 chrome.storage.session 持久化，防止 Service Worker 休眠丢失）
// ============================================================================

/** 内存缓存，加速访问 */
let lastSnapshotRefs: Record<string, RefInfo> = {};

/** 当前活动 Frame 的 frameId（用于 iframe 支持） */
let activeFrameId: string | null = null;

/** 从 storage 恢复 refs（Service Worker 唤醒时调用） */
async function loadRefsFromStorage(): Promise<void> {
  try {
    const result = await chrome.storage.session.get('snapshotRefs');
    if (result.snapshotRefs) {
      lastSnapshotRefs = result.snapshotRefs;
      console.log('[CDPDOMService] Loaded refs from storage:', Object.keys(lastSnapshotRefs).length);
    }
  } catch (e) {
    console.warn('[CDPDOMService] Failed to load refs from storage:', e);
  }
}

/** 保存 refs 到 storage */
async function saveRefsToStorage(refs: Record<string, RefInfo>): Promise<void> {
  try {
    await chrome.storage.session.set({ snapshotRefs: refs });
    console.log('[CDPDOMService] Saved refs to storage:', Object.keys(refs).length);
  } catch (e) {
    console.warn('[CDPDOMService] Failed to save refs to storage:', e);
  }
}

// Service Worker 启动时恢复 refs
loadRefsFromStorage();

// ============================================================================
// Snapshot 实现
// ============================================================================

/**
 * 获取页面快照
 * 暂时使用旧的实现（chrome.scripting.executeScript + buildDomTree）
 * TODO: 后续迁移到纯 CDP 实现（Accessibility.getFullAXTree 或 Runtime.evaluate）
 */
export async function getSnapshot(
  tabId: number,
  options: SnapshotOptions = {}
): Promise<SnapshotResult> {
  console.log('[CDPDOMService] Getting snapshot via legacy method for tab:', tabId);
  
  // 使用旧的实现
  const result = await legacyGetSnapshot(tabId, options);
  
  // 转换 refs 格式（添加 xpath 兼容）
  const convertedRefs: Record<string, RefInfo> = {};
  for (const [refId, refInfo] of Object.entries(result.refs)) {
    convertedRefs[refId] = {
      xpath: refInfo.xpath,
      role: refInfo.role,
      name: refInfo.name,
      tagName: refInfo.tagName,
    };
  }
  
  // 保存 refs 供后续操作使用（内存 + storage）
  lastSnapshotRefs = convertedRefs;
  await saveRefsToStorage(convertedRefs);
  
  console.log('[CDPDOMService] Snapshot complete:', {
    linesCount: result.snapshot.split('\n').length,
    refsCount: Object.keys(convertedRefs).length,
  });
  
  return {
    snapshot: result.snapshot,
    refs: convertedRefs,
  };
}

// ============================================================================
// DOM 操作
// ============================================================================

/**
 * 获取 ref 对应的信息
 * 优先从内存缓存读取，如果没有则尝试从 storage 恢复
 */
export async function getRefInfo(ref: string): Promise<RefInfo | null> {
  const refId = ref.startsWith('@') ? ref.slice(1) : ref;
  
  // 先检查内存缓存
  if (lastSnapshotRefs[refId]) {
    return lastSnapshotRefs[refId];
  }
  
  // 内存中没有，尝试从 storage 恢复
  if (Object.keys(lastSnapshotRefs).length === 0) {
    await loadRefsFromStorage();
  }
  
  return lastSnapshotRefs[refId] || null;
}

/**
 * 通过 xpath 获取元素的 nodeId 和 backendNodeId
 */
async function getNodeByXPath(
  tabId: number,
  xpath: string
): Promise<{ nodeId: number; backendNodeId: number }> {
  // 先获取文档根节点
  const doc = await cdp.getDocument(tabId, { depth: 0 });
  
  // 使用 DOM.performSearch 或 Runtime.evaluate 来查找 xpath
  // CDP 没有直接的 xpath 查询，我们用 Runtime.evaluate
  const result = await cdp.evaluate(tabId, `
    (function() {
      const result = document.evaluate(
        ${JSON.stringify(xpath)},
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue;
      if (!element) return null;
      
      // 返回元素的一些信息供调试
      const rect = element.getBoundingClientRect();
      return {
        found: true,
        tagName: element.tagName,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      };
    })()
  `, { returnByValue: true });
  
  if (!result || !(result as { found?: boolean }).found) {
    throw new Error(`Element not found by xpath: ${xpath}`);
  }
  
  return result as { nodeId: number; backendNodeId: number; x: number; y: number };
}

/**
 * 通过 xpath 获取元素的中心坐标
 */
async function getElementCenterByXPath(
  tabId: number,
  xpath: string
): Promise<{ x: number; y: number }> {
  const result = await cdp.evaluate(tabId, `
    (function() {
      const result = document.evaluate(
        ${JSON.stringify(xpath)},
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue;
      if (!element) return null;
      
      // 滚动到可见
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()
  `, { returnByValue: true });
  
  if (!result) {
    throw new Error(`Element not found by xpath: ${xpath}`);
  }
  
  return result as { x: number; y: number };
}

/**
 * 点击元素
 * 使用 CDP Runtime.evaluate 定位 + Input.dispatchMouseEvent 点击
 */
export async function clickElement(
  tabId: number,
  ref: string
): Promise<{ role: string; name?: string }> {
  const refInfo = await getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;

  // 获取元素中心坐标（同时滚动到可见）
  const { x, y } = await getElementCenterByXPath(tabId, xpath);

  // 使用 CDP 点击
  await cdp.click(tabId, x, y);

  console.log('[CDPDOMService] Clicked element:', { ref, role, name, x, y });
  return { role, name };
}

/**
 * 悬停在元素上
 * 使用 CDP Runtime.evaluate 定位 + Input.dispatchMouseEvent 悬停
 */
export async function hoverElement(
  tabId: number,
  ref: string
): Promise<{ role: string; name?: string }> {
  const refInfo = await getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;

  // 获取元素中心坐标（同时滚动到可见）
  const { x, y } = await getElementCenterByXPath(tabId, xpath);

  // 使用 CDP 移动鼠标
  await cdp.moveMouse(tabId, x, y);

  console.log('[CDPDOMService] Hovered element:', { ref, role, name, x, y });
  return { role, name };
}

/**
 * 填充输入框（清空后输入）
 * 使用 CDP Runtime.evaluate 聚焦 + Input.insertText 输入
 */
export async function fillElement(
  tabId: number,
  ref: string,
  text: string
): Promise<{ role: string; name?: string }> {
  const refInfo = await getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;

  // 滚动到可见并聚焦
  await cdp.evaluate(tabId, `
    (function() {
      const result = document.evaluate(
        ${JSON.stringify(xpath)},
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue;
      if (!element) throw new Error('Element not found');
      
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      element.focus();
      
      // 清空内容
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = '';
      } else if (element.isContentEditable) {
        element.textContent = '';
      }
    })()
  `);

  // 输入文本
  await cdp.insertText(tabId, text);

  console.log('[CDPDOMService] Filled element:', { ref, role, name, textLength: text.length });
  return { role, name };
}

/**
 * 逐字符输入文本（不清空）
 * 使用 CDP Runtime.evaluate 聚焦 + Input.dispatchKeyEvent 输入
 */
export async function typeElement(
  tabId: number,
  ref: string,
  text: string
): Promise<{ role: string; name?: string }> {
  const refInfo = await getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;

  // 滚动到可见并聚焦
  await cdp.evaluate(tabId, `
    (function() {
      const result = document.evaluate(
        ${JSON.stringify(xpath)},
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue;
      if (!element) throw new Error('Element not found');
      
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      element.focus();
    })()
  `);

  // 逐字符输入
  for (const char of text) {
    await cdp.pressKey(tabId, char);
  }

  console.log('[CDPDOMService] Typed in element:', { ref, role, name, textLength: text.length });
  return { role, name };
}

/**
 * 获取元素文本内容
 * 使用 CDP Runtime.evaluate
 */
export async function getElementText(tabId: number, ref: string): Promise<string> {
  const refInfo = await getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath } = refInfo;

  const text = await cdp.evaluate(tabId, `
    (function() {
      const result = document.evaluate(
        ${JSON.stringify(xpath)},
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue;
      if (!element) return '';
      return (element.textContent || '').trim();
    })()
  `);

  console.log('[CDPDOMService] Got element text:', { ref, textLength: (text as string).length });
  return text as string;
}

/**
 * 勾选复选框
 * 使用 CDP Runtime.evaluate
 */
export async function checkElement(
  tabId: number,
  ref: string
): Promise<{ role: string; name?: string; wasAlreadyChecked: boolean }> {
  const refInfo = await getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;

  const result = await cdp.evaluate(tabId, `
    (function() {
      const result = document.evaluate(
        ${JSON.stringify(xpath)},
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue;
      if (!element) throw new Error('Element not found');
      if (element.type !== 'checkbox' && element.type !== 'radio') {
        throw new Error('Element is not a checkbox or radio');
      }
      const wasChecked = element.checked;
      if (!wasChecked) {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return wasChecked;
    })()
  `);

  console.log('[CDPDOMService] Checked element:', { ref, role, name, wasAlreadyChecked: result });
  return { role, name, wasAlreadyChecked: result as boolean };
}

/**
 * 取消勾选复选框
 * 使用 CDP Runtime.evaluate
 */
export async function uncheckElement(
  tabId: number,
  ref: string
): Promise<{ role: string; name?: string; wasAlreadyUnchecked: boolean }> {
  const refInfo = await getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;

  const result = await cdp.evaluate(tabId, `
    (function() {
      const result = document.evaluate(
        ${JSON.stringify(xpath)},
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue;
      if (!element) throw new Error('Element not found');
      if (element.type !== 'checkbox' && element.type !== 'radio') {
        throw new Error('Element is not a checkbox or radio');
      }
      const wasUnchecked = !element.checked;
      if (!wasUnchecked) {
        element.checked = false;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return wasUnchecked;
    })()
  `);

  console.log('[CDPDOMService] Unchecked element:', { ref, role, name, wasAlreadyUnchecked: result });
  return { role, name, wasAlreadyUnchecked: result as boolean };
}

/**
 * 选择下拉框选项
 * 使用 CDP Runtime.evaluate
 */
export async function selectOption(
  tabId: number,
  ref: string,
  value: string
): Promise<{ role: string; name?: string; selectedValue: string; selectedLabel: string }> {
  const refInfo = await getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;

  const result = await cdp.evaluate(tabId, `
    (function() {
      const selectValue = ${JSON.stringify(value)};
      const result = document.evaluate(
        ${JSON.stringify(xpath)},
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue;
      if (!element) throw new Error('Element not found');
      if (element.tagName !== 'SELECT') {
        throw new Error('Element is not a <select> element');
      }
      
      // 尝试通过 value 或 text 匹配
      let matched = null;
      for (const opt of element.options) {
        if (opt.value === selectValue || opt.textContent.trim() === selectValue) {
          matched = opt;
          break;
        }
      }
      
      // 不区分大小写匹配
      if (!matched) {
        const lower = selectValue.toLowerCase();
        for (const opt of element.options) {
          if (opt.value.toLowerCase() === lower || opt.textContent.trim().toLowerCase() === lower) {
            matched = opt;
            break;
          }
        }
      }
      
      if (!matched) {
        const available = Array.from(element.options).map(o => ({ value: o.value, label: o.textContent.trim() }));
        throw new Error('Option not found: ' + selectValue + '. Available: ' + JSON.stringify(available));
      }
      
      element.value = matched.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      return { selectedValue: matched.value, selectedLabel: matched.textContent.trim() };
    })()
  `);

  const { selectedValue, selectedLabel } = result as { selectedValue: string; selectedLabel: string };
  console.log('[CDPDOMService] Selected option:', { ref, role, name, selectedValue });
  return { role, name, selectedValue, selectedLabel };
}

/**
 * 等待元素出现
 * 使用 CDP Runtime.evaluate 检查元素是否存在
 */
export async function waitForElement(
  tabId: number,
  ref: string,
  maxWait = 10000,
  interval = 200
): Promise<void> {
  const refInfo = await getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath } = refInfo;
  let elapsed = 0;

  while (elapsed < maxWait) {
    const found = await cdp.evaluate(tabId, `
      (function() {
        const result = document.evaluate(
          ${JSON.stringify(xpath)},
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue !== null;
      })()
    `);

    if (found) {
      console.log('[CDPDOMService] Element found:', { ref, elapsed });
      return;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
    elapsed += interval;
  }

  throw new Error(`Timeout waiting for element @${ref} after ${maxWait}ms`);
}

// ============================================================================
// Frame 管理
// ============================================================================

/**
 * 设置活动 frame
 */
export function setActiveFrameId(frameId: string | null): void {
  activeFrameId = frameId;
  console.log('[CDPDOMService] Active frame changed:', frameId ?? 'main');
}

/**
 * 获取活动 frame
 */
export function getActiveFrameId(): string | null {
  return activeFrameId;
}

// ============================================================================
// 输入操作
// ============================================================================

/**
 * 发送键盘按键
 */
export async function pressKey(
  tabId: number,
  key: string,
  modifiers: string[] = []
): Promise<void> {
  // 计算 modifiers 位掩码
  let modifierFlags = 0;
  if (modifiers.includes('Alt')) modifierFlags |= 1;
  if (modifiers.includes('Control')) modifierFlags |= 2;
  if (modifiers.includes('Meta')) modifierFlags |= 4;
  if (modifiers.includes('Shift')) modifierFlags |= 8;

  await cdp.pressKey(tabId, key, { modifiers: modifierFlags });
  console.log('[CDPDOMService] Pressed key:', key, modifiers);
}

/**
 * 滚动页面
 */
export async function scrollPage(
  tabId: number,
  direction: 'up' | 'down' | 'left' | 'right',
  pixels: number
): Promise<void> {
  // 获取页面尺寸以确定滚动位置
  const result = await cdp.evaluate(
    tabId,
    'JSON.stringify({ width: window.innerWidth, height: window.innerHeight })'
  );
  const { width, height } = JSON.parse(result as string);
  
  // 在页面中心位置滚动
  const x = width / 2;
  const y = height / 2;
  
  let deltaX = 0;
  let deltaY = 0;
  
  switch (direction) {
    case 'up': deltaY = -pixels; break;
    case 'down': deltaY = pixels; break;
    case 'left': deltaX = -pixels; break;
    case 'right': deltaX = pixels; break;
  }

  await cdp.scroll(tabId, x, y, deltaX, deltaY);
  console.log('[CDPDOMService] Scrolled:', { direction, pixels });
}
