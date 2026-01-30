/**
 * Trace Content Script
 * 
 * 负责在页面中监听用户操作（click, input, select, keydown, scroll）
 * 并将事件发送到 background service worker
 */

// 录制状态
let isRecording = false;

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成元素的 XPath
 */
function getXPath(element: HTMLElement): string {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  
  if (element === document.body) {
    return '/html/body';
  }

  let index = 1;
  const siblings = element.parentNode?.children;
  if (siblings) {
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        const parentPath = element.parentElement 
          ? getXPath(element.parentElement) 
          : '';
        return `${parentPath}/${element.tagName.toLowerCase()}[${index}]`;
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
        index++;
      }
    }
  }
  
  return element.tagName.toLowerCase();
}

/**
 * 获取元素的 highlightIndex（向上查找）
 * buildDomTree.js 会在元素上设置 data-highlight-index 属性
 */
function getHighlightIndex(element: HTMLElement): number | undefined {
  let current: HTMLElement | null = element;
  
  while (current) {
    const attr = current.getAttribute('data-highlight-index');
    if (attr !== null) {
      const index = parseInt(attr, 10);
      if (!isNaN(index)) {
        return index;
      }
    }
    current = current.parentElement;
  }
  
  return undefined;
}

/**
 * 提取元素的语义信息
 */
function extractSemanticInfo(element: HTMLElement): {
  role: string;
  name: string;
  tag: string;
} {
  const tag = element.tagName.toLowerCase();
  
  // 获取 role（优先使用 aria-role，其次推断）
  let role = element.getAttribute('role') || '';
  if (!role) {
    switch (tag) {
      case 'button':
        role = 'button';
        break;
      case 'a':
        role = 'link';
        break;
      case 'input': {
        const type = (element as HTMLInputElement).type;
        switch (type) {
          case 'text':
          case 'email':
          case 'password':
          case 'search':
          case 'tel':
          case 'url':
            role = 'textbox';
            break;
          case 'checkbox':
            role = 'checkbox';
            break;
          case 'radio':
            role = 'radio';
            break;
          case 'submit':
          case 'button':
            role = 'button';
            break;
          default:
            role = 'textbox';
        }
        break;
      }
      case 'textarea':
        role = 'textbox';
        break;
      case 'select':
        role = 'combobox';
        break;
      case 'img':
        role = 'img';
        break;
      default:
        role = tag;
    }
  }

  // 获取 name（可访问名称）
  let name = '';
  
  // 优先级：aria-label > aria-labelledby > title > alt > placeholder > textContent
  name = element.getAttribute('aria-label') || '';
  
  if (!name) {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelElement = document.getElementById(labelledBy);
      if (labelElement) {
        name = labelElement.textContent?.trim() || '';
      }
    }
  }
  
  if (!name) {
    // 对于 input 元素，查找关联的 label
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        name = label.textContent?.trim() || '';
      }
    }
  }
  
  if (!name) {
    name = element.getAttribute('title') || 
           element.getAttribute('alt') || 
           (element as HTMLInputElement).placeholder ||
           element.textContent?.trim().slice(0, 50) || '';
  }

  return { role, name, tag };
}

/**
 * 生成 CSS 选择器
 */
function getCssSelector(element: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector = `#${current.id}`;
      parts.unshift(selector);
      break;
    }
    
    if (current.className) {
      const classes = current.className.split(/\s+/).filter(c => c && /^[a-zA-Z_]/.test(c));
      if (classes.length > 0) {
        selector += '.' + classes.slice(0, 2).join('.');
      }
    }
    
    parts.unshift(selector);
    current = current.parentElement;
  }
  
  return parts.join(' > ');
}

// ============================================================================
// 事件处理器
// ============================================================================

/**
 * 处理点击事件
 */
function handleClick(event: MouseEvent): void {
  if (!isRecording) return;
  
  const target = event.target as HTMLElement;
  if (!target) return;

  const semanticInfo = extractSemanticInfo(target);
  const inputType = (target as HTMLInputElement).type?.toLowerCase();
  
  // 判断是否是 checkbox
  const isCheckbox = target.tagName.toLowerCase() === 'input' && inputType === 'checkbox';
  
  const traceEvent = {
    type: isCheckbox ? 'check' : 'click' as const,
    timestamp: Date.now(),
    url: window.location.href,
    ref: getHighlightIndex(target),
    xpath: getXPath(target),
    cssSelector: getCssSelector(target),
    elementRole: semanticInfo.role,
    elementName: semanticInfo.name,
    elementTag: semanticInfo.tag,
    // 如果是 checkbox，记录状态
    checked: isCheckbox ? (target as HTMLInputElement).checked : undefined,
  };

  console.log('[Trace] Click event:', traceEvent);
  chrome.runtime.sendMessage({ type: 'TRACE_EVENT', payload: traceEvent });
}

/**
 * 处理输入事件（防抖）
 */
let inputDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastInputElement: HTMLElement | null = null;
let lastInputValue = '';

function handleInput(event: Event): void {
  if (!isRecording) return;
  
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;
  if (!target || !('value' in target)) return;

  // 防抖处理：同一个元素的连续输入合并
  if (inputDebounceTimer) {
    clearTimeout(inputDebounceTimer);
  }
  
  lastInputElement = target;
  lastInputValue = target.value;

  inputDebounceTimer = setTimeout(() => {
    if (!lastInputElement) return;
    
    const semanticInfo = extractSemanticInfo(lastInputElement);
    const isPassword = (lastInputElement as HTMLInputElement).type === 'password';
    
    const traceEvent = {
      type: 'fill' as const,
      timestamp: Date.now(),
      url: window.location.href,
      ref: getHighlightIndex(lastInputElement),
      xpath: getXPath(lastInputElement),
      cssSelector: getCssSelector(lastInputElement),
      value: isPassword ? '********' : lastInputValue,
      elementRole: semanticInfo.role,
      elementName: semanticInfo.name,
      elementTag: semanticInfo.tag,
    };

    console.log('[Trace] Input event:', traceEvent);
    chrome.runtime.sendMessage({ type: 'TRACE_EVENT', payload: traceEvent });
    
    inputDebounceTimer = null;
    lastInputElement = null;
    lastInputValue = '';
  }, 500); // 500ms 防抖
}

/**
 * 处理 select 变化事件
 */
function handleChange(event: Event): void {
  if (!isRecording) return;
  
  const target = event.target as HTMLSelectElement;
  if (!target || target.tagName !== 'SELECT') return;

  const semanticInfo = extractSemanticInfo(target);
  const selectedOption = target.options[target.selectedIndex];
  
  const traceEvent = {
    type: 'select' as const,
    timestamp: Date.now(),
    url: window.location.href,
    ref: getHighlightIndex(target),
    xpath: getXPath(target),
    cssSelector: getCssSelector(target),
    value: selectedOption?.text || target.value,
    elementRole: semanticInfo.role,
    elementName: semanticInfo.name,
    elementTag: semanticInfo.tag,
  };

  console.log('[Trace] Select event:', traceEvent);
  chrome.runtime.sendMessage({ type: 'TRACE_EVENT', payload: traceEvent });
}

/**
 * 处理键盘事件
 */
const CAPTURED_KEYS = new Set([
  'Enter', 'Tab', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  'Backspace', 'Delete',
]);

function handleKeydown(event: KeyboardEvent): void {
  if (!isRecording) return;
  
  const key = event.key;
  let keyToLog = '';

  // 检查是否是需要捕获的特殊键
  if (CAPTURED_KEYS.has(key)) {
    keyToLog = key;
  }
  // 检查 Ctrl/Cmd + 字母/数字 组合键
  else if ((event.ctrlKey || event.metaKey) && key.length === 1 && /[a-zA-Z0-9]/.test(key)) {
    const modifier = event.metaKey ? 'Meta' : 'Control';
    keyToLog = `${modifier}+${key.toLowerCase()}`;
  }

  if (!keyToLog) return;

  const target = event.target as HTMLElement;
  const semanticInfo = target ? extractSemanticInfo(target) : { role: '', name: '', tag: 'document' };
  
  const traceEvent = {
    type: 'press' as const,
    timestamp: Date.now(),
    url: window.location.href,
    ref: target ? getHighlightIndex(target) : undefined,
    xpath: target ? getXPath(target) : undefined,
    cssSelector: target ? getCssSelector(target) : undefined,
    key: keyToLog,
    elementRole: semanticInfo.role,
    elementName: semanticInfo.name,
    elementTag: semanticInfo.tag,
  };

  console.log('[Trace] Keydown event:', traceEvent);
  chrome.runtime.sendMessage({ type: 'TRACE_EVENT', payload: traceEvent });
}

/**
 * 处理滚动事件（防抖）
 */
let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let scrollStartY = 0;

function handleScroll(): void {
  if (!isRecording) return;

  if (!scrollDebounceTimer) {
    scrollStartY = window.scrollY;
  } else {
    clearTimeout(scrollDebounceTimer);
  }

  scrollDebounceTimer = setTimeout(() => {
    const scrollEndY = window.scrollY;
    const deltaY = scrollEndY - scrollStartY;
    
    if (Math.abs(deltaY) < 50) {
      scrollDebounceTimer = null;
      return; // 忽略小幅滚动
    }

    const direction = deltaY > 0 ? 'down' : 'up';
    const pixels = Math.abs(deltaY);
    
    const traceEvent = {
      type: 'scroll' as const,
      timestamp: Date.now(),
      url: window.location.href,
      direction: direction as 'up' | 'down',
      pixels,
    };

    console.log('[Trace] Scroll event:', traceEvent);
    chrome.runtime.sendMessage({ type: 'TRACE_EVENT', payload: traceEvent });
    
    scrollDebounceTimer = null;
  }, 300); // 300ms 防抖
}

// ============================================================================
// 录制控制
// ============================================================================

/**
 * 开始录制
 */
function startRecording(): void {
  if (isRecording) return;
  
  console.log('[Trace] Starting recording on:', window.location.href);
  isRecording = true;
  
  document.addEventListener('click', handleClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('change', handleChange, true);
  document.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('scroll', handleScroll, { passive: true });
}

/**
 * 停止录制
 */
function stopRecording(): void {
  if (!isRecording) return;
  
  console.log('[Trace] Stopping recording on:', window.location.href);
  isRecording = false;
  
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('change', handleChange, true);
  document.removeEventListener('keydown', handleKeydown, true);
  window.removeEventListener('scroll', handleScroll);
  
  // 清理防抖定时器
  if (inputDebounceTimer) {
    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = null;
  }
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = null;
  }
}

// ============================================================================
// 消息监听
// ============================================================================

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TRACE_START') {
    startRecording();
    sendResponse({ success: true });
  } else if (message.type === 'TRACE_STOP') {
    stopRecording();
    sendResponse({ success: true });
  } else if (message.type === 'TRACE_STATUS') {
    sendResponse({ recording: isRecording });
  }
  return true;
});

// 请求初始状态
chrome.runtime.sendMessage({ type: 'GET_TRACE_STATUS' }, (response) => {
  if (chrome.runtime.lastError) {
    console.log('[Trace] Error getting initial status:', chrome.runtime.lastError.message);
    return;
  }
  if (response?.recording) {
    startRecording();
  }
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
  stopRecording();
});

console.log('[Trace] Content script loaded on:', window.location.href);
