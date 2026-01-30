/**
 * DOM Service for bb-browser Extension
 * 封装 buildDomTree 的注入和调用逻辑，将 DOM 树转换为可访问性树文本格式
 */

/** buildDomTree 返回的原始节点类型 */
interface RawDomTextNode {
  type: 'TEXT_NODE';
  text: string;
  isVisible: boolean;
}

interface RawDomElementNode {
  tagName: string;
  xpath: string | null;
  attributes: Record<string, string>;
  children: string[];
  isVisible?: boolean;
  isInteractive?: boolean;
  isTopElement?: boolean;
  isInViewport?: boolean;
  highlightIndex?: number;
  shadowRoot?: boolean;
}

type RawDomTreeNode = RawDomTextNode | RawDomElementNode;

interface BuildDomTreeResult {
  rootId: string;
  map: Record<string, RawDomTreeNode>;
}

/** Ref 元素信息 */
export interface RefInfo {
  xpath: string;
  role: string;
  name?: string;
  tagName: string;
}

/** Snapshot 结果 */
export interface SnapshotResult {
  snapshot: string;
  refs: Record<string, RefInfo>;
}

/** buildDomTree 的参数 */
interface BuildDomTreeArgs {
  showHighlightElements: boolean;
  focusHighlightIndex: number;
  viewportExpansion: number;
  debugMode: boolean;
  startId: number;
  startHighlightIndex: number;
}

declare global {
  interface Window {
    buildDomTree: (args: BuildDomTreeArgs) => BuildDomTreeResult | null;
  }
}

/**
 * 将 tagName 转换为可访问性角色
 */
function getRole(node: RawDomElementNode): string {
  const tagName = node.tagName.toLowerCase();
  const role = node.attributes?.role;
  
  // 如果有显式 role 属性，使用它
  if (role) {
    return role;
  }
  
  // 根据 tagName 推断角色
  const roleMap: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: getInputRole(node),
    select: 'combobox',
    textarea: 'textbox',
    img: 'image',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    aside: 'complementary',
    form: 'form',
    table: 'table',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    dialog: 'dialog',
    article: 'article',
    section: 'region',
    label: 'label',
    details: 'group',
    summary: 'button',
  };
  
  return roleMap[tagName] || tagName;
}

/**
 * 根据 input type 获取角色
 */
function getInputRole(node: RawDomElementNode): string {
  const type = node.attributes?.type?.toLowerCase() || 'text';
  
  const inputRoleMap: Record<string, string> = {
    text: 'textbox',
    password: 'textbox',
    email: 'textbox',
    url: 'textbox',
    tel: 'textbox',
    search: 'searchbox',
    number: 'spinbutton',
    range: 'slider',
    checkbox: 'checkbox',
    radio: 'radio',
    button: 'button',
    submit: 'button',
    reset: 'button',
    file: 'button',
  };
  
  return inputRoleMap[type] || 'textbox';
}

/**
 * 获取元素的可访问名称
 */
function getAccessibleName(node: RawDomElementNode, nodeMap: Record<string, RawDomTreeNode>): string | undefined {
  const attrs = node.attributes || {};
  
  // 优先使用 aria-label
  if (attrs['aria-label']) {
    return attrs['aria-label'];
  }
  
  // 使用 title
  if (attrs.title) {
    return attrs.title;
  }
  
  // 使用 placeholder
  if (attrs.placeholder) {
    return attrs.placeholder;
  }
  
  // 使用 alt (for images)
  if (attrs.alt) {
    return attrs.alt;
  }
  
  // 使用 value (for inputs)
  if (attrs.value) {
    return attrs.value;
  }
  
  // 收集子文本节点的文本
  const textContent = collectTextContent(node, nodeMap);
  if (textContent) {
    return textContent;
  }
  
  // 使用 name 属性
  if (attrs.name) {
    return attrs.name;
  }
  
  return undefined;
}

/**
 * 收集节点的文本内容
 * @param node 要收集文本的节点
 * @param nodeMap 节点映射
 * @param maxDepth 最大递归深度
 * @param stopAtInteractive 是否在遇到可交互子元素时停止
 */
function collectTextContent(
  node: RawDomElementNode, 
  nodeMap: Record<string, RawDomTreeNode>, 
  maxDepth = 5,
  stopAtInteractive = false
): string {
  const texts: string[] = [];
  
  function collect(nodeId: string, depth: number): void {
    if (depth > maxDepth) return;
    
    const currentNode = nodeMap[nodeId];
    if (!currentNode) return;
    
    // 文本节点
    if ('type' in currentNode && currentNode.type === 'TEXT_NODE') {
      const text = currentNode.text.trim();
      if (text) {
        texts.push(text);
      }
      return;
    }
    
    // 元素节点
    const elementNode = currentNode as RawDomElementNode;
    
    // 如果设置了 stopAtInteractive 且是另一个可交互元素，停止收集
    if (stopAtInteractive && elementNode.highlightIndex !== undefined && depth > 0) {
      return;
    }
    
    // 递归处理子节点
    for (const childId of elementNode.children || []) {
      collect(childId, depth + 1);
    }
  }
  
  for (const childId of node.children || []) {
    collect(childId, 0);
  }
  
  return texts.join(' ').trim();
}

/**
 * 截断文本
 */
function truncateText(text: string, maxLength = 50): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * 检查节点 A 是否是节点 B 的祖先
 */
function isAncestor(ancestorId: string, descendantId: string, nodeMap: Record<string, RawDomTreeNode>): boolean {
  const descendant = nodeMap[descendantId];
  if (!descendant || 'type' in descendant) return false;
  
  const elementNode = descendant as RawDomElementNode;
  // 通过 xpath 判断祖先关系
  const ancestor = nodeMap[ancestorId];
  if (!ancestor || 'type' in ancestor) return false;
  
  const ancestorElement = ancestor as RawDomElementNode;
  if (!ancestorElement.xpath || !elementNode.xpath) return false;
  
  // 如果 descendant 的 xpath 以 ancestor 的 xpath 开头，则 ancestor 是 descendant 的祖先
  return elementNode.xpath.startsWith(ancestorElement.xpath + '/');
}

/**
 * 将 DOM 树转换为可访问性树文本格式
 */
function convertToAccessibilityTree(result: BuildDomTreeResult): SnapshotResult {
  const lines: string[] = [];
  const refs: Record<string, RefInfo> = {};
  
  const { rootId, map } = result;
  
  // 收集所有有 highlightIndex 的节点
  const interactiveNodes: Array<{ id: string; node: RawDomElementNode }> = [];
  
  for (const [id, node] of Object.entries(map)) {
    if (!node) continue;
    if ('type' in node && node.type === 'TEXT_NODE') continue;
    
    const elementNode = node as RawDomElementNode;
    if (elementNode.highlightIndex !== undefined && elementNode.highlightIndex !== null) {
      interactiveNodes.push({ id, node: elementNode });
    }
  }
  
  // 按 highlightIndex 排序
  interactiveNodes.sort((a, b) => (a.node.highlightIndex ?? 0) - (b.node.highlightIndex ?? 0));
  
  // 去重：过滤掉与父元素名称相同的子元素
  // 思路：如果子元素的 name 与某个祖先元素相同，且祖先也是可交互的，则跳过子元素
  const filteredNodes: Array<{ id: string; node: RawDomElementNode }> = [];
  const nodeIdToInfo = new Map<string, { name: string | undefined; role: string }>();
  
  // 先收集所有节点的 name 和 role
  for (const { id, node } of interactiveNodes) {
    const name = getAccessibleName(node, map);
    const role = getRole(node);
    nodeIdToInfo.set(id, { name, role });
  }
  
  // 非语义化标签集合（没有名称时应该过滤掉）
  const nonSemanticTags = new Set(['span', 'div', 'i', 'b', 'em', 'strong', 'small', 'svg', 'path', 'g']);
  
  // 应该过滤的标签（通常点击它们等于点击关联元素）
  const filterableTags = new Set(['label']);
  
  // 过滤冗余节点
  for (const item of interactiveNodes) {
    const { id, node } = item;
    const info = nodeIdToInfo.get(id)!;
    const tagName = node.tagName.toLowerCase();
    
    // 规则1: 过滤没有名称的非语义化元素（包括 link）
    if ((nonSemanticTags.has(tagName) || tagName === 'a') && !info.name) {
      continue;
    }
    
    // 规则2: 过滤 label 元素（点击 label 等于点击对应 input）
    if (filterableTags.has(tagName)) {
      continue;
    }
    
    // 规则3: 检查是否有祖先节点，且当前节点是非语义化子元素
    // 如果父元素是可交互的（如 link, button），子元素的 div/span 应该被过滤
    let isChildOfInteractive = false;
    for (const otherItem of interactiveNodes) {
      if (otherItem.id === id) continue;
      
      const otherTagName = otherItem.node.tagName.toLowerCase();
      const isInteractiveParent = ['a', 'button'].includes(otherTagName);
      
      // 如果 otherItem 是当前节点的祖先，且是可交互元素，且当前是非语义化元素
      if (isInteractiveParent && 
          nonSemanticTags.has(tagName) && 
          isAncestor(otherItem.id, id, map)) {
        isChildOfInteractive = true;
        break;
      }
    }
    
    if (isChildOfInteractive) {
      continue;
    }
    
    // 规则4: 检查是否有祖先节点与当前节点有相同的 name
    let isDuplicate = false;
    for (const otherItem of interactiveNodes) {
      if (otherItem.id === id) continue;
      
      const otherInfo = nodeIdToInfo.get(otherItem.id)!;
      
      // 如果 otherItem 是当前节点的祖先，且 name 相同
      if (isAncestor(otherItem.id, id, map) && 
          info.name && otherInfo.name && 
          info.name === otherInfo.name) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      filteredNodes.push(item);
    }
  }
  
  // 生成可访问性树文本和 refs
  for (const { id, node } of filteredNodes) {
    const refId = String(node.highlightIndex);
    const info = nodeIdToInfo.get(id)!;
    const role = info.role;
    const name = info.name;
    const tagName = node.tagName;
    
    // 构建行文本
    let line = `- ${role}`;
    if (name) {
      line += ` "${truncateText(name)}"`;
    }
    line += ` [ref=${refId}]`;
    
    lines.push(line);
    
    // 构建 ref 信息
    refs[refId] = {
      xpath: node.xpath || '',
      role,
      name: name ? truncateText(name, 100) : undefined,
      tagName,
    };
  }
  
  return {
    snapshot: lines.join('\n'),
    refs,
  };
}

/**
 * 注入 buildDomTree 脚本到目标标签页
 */
async function injectBuildDomTreeScript(tabId: number): Promise<void> {
  try {
    const target = getFrameTarget(tabId);
    
    // 检查脚本是否已注入
    const checkResults = await chrome.scripting.executeScript({
      target,
      func: () => Object.prototype.hasOwnProperty.call(window, 'buildDomTree'),
    });
    
    const isInjected = checkResults[0]?.result;
    if (isInjected) {
      return;
    }
    
    // 注入脚本
    await chrome.scripting.executeScript({
      target,
      files: ['buildDomTree.js'],
    });
  } catch (error) {
    console.error('[DOMService] Failed to inject buildDomTree script:', error);
    throw new Error(`Failed to inject script: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 执行 buildDomTree 并获取 DOM 快照
 */
async function executeBuildDomTree(tabId: number): Promise<BuildDomTreeResult> {
  const target = getFrameTarget(tabId);
  
  const results = await chrome.scripting.executeScript({
    target,
    func: (args: BuildDomTreeArgs) => {
      return (window as unknown as { buildDomTree: (args: BuildDomTreeArgs) => BuildDomTreeResult | null }).buildDomTree(args);
    },
    args: [{
      showHighlightElements: true,
      focusHighlightIndex: -1,
      viewportExpansion: -1,  // -1 = 全页面模式，不限制视口
      debugMode: false,
      startId: 0,
      startHighlightIndex: 0,
    }],
  });
  
  const result = results[0]?.result as BuildDomTreeResult | null;
  if (!result || !result.map || !result.rootId) {
    throw new Error('Failed to build DOM tree: invalid result structure');
  }
  
  return result;
}

/** Snapshot 选项 */
export interface SnapshotOptions {
  /** 是否只输出可交互元素，默认 false（输出完整树） */
  interactive?: boolean;
}

/**
 * 将 DOM 树转换为完整树文本格式（包含所有元素和文本节点）
 */
function convertToFullTree(result: BuildDomTreeResult): SnapshotResult {
  const lines: string[] = [];
  const refs: Record<string, RefInfo> = {};
  
  const { rootId, map } = result;
  
  // 应该跳过的标签
  const skipTags = new Set(['script', 'style', 'noscript', 'svg', 'path', 'g', 'defs', 'clippath', 'lineargradient', 'stop', 'symbol', 'use', 'meta', 'link', 'head']);
  
  /**
   * 递归遍历节点
   */
  function traverse(nodeId: string, depth: number): void {
    const node = map[nodeId];
    if (!node) return;
    
    const indent = '  '.repeat(depth);
    
    // 文本节点
    if ('type' in node && node.type === 'TEXT_NODE') {
      if (!node.isVisible) return;
      const text = node.text.trim();
      if (!text) return;
      // 截断到 100 字符
      const displayText = text.length > 100 ? text.slice(0, 97) + '...' : text;
      lines.push(`${indent}- text: ${displayText}`);
      return;
    }
    
    // 元素节点
    const elementNode = node as RawDomElementNode;
    const tagName = elementNode.tagName.toLowerCase();
    
    // 跳过不可见元素
    if (elementNode.isVisible === false) return;
    
    // 跳过特定标签
    if (skipTags.has(tagName)) return;
    
    // 获取角色和名称
    const role = getRole(elementNode);
    const name = getAccessibleName(elementNode, map);
    const hasRef = elementNode.highlightIndex !== undefined && elementNode.highlightIndex !== null;
    
    // 构建行文本
    let line = `${indent}- ${role}`;
    if (name) {
      const displayName = name.length > 50 ? name.slice(0, 47) + '...' : name;
      line += ` "${displayName}"`;
    }
    if (hasRef) {
      const refId = String(elementNode.highlightIndex);
      line += ` [ref=${refId}]`;
      
      // 记录 ref 信息
      refs[refId] = {
        xpath: elementNode.xpath || '',
        role,
        name: name ? (name.length > 100 ? name.slice(0, 97) + '...' : name) : undefined,
        tagName: elementNode.tagName,
      };
    }
    
    lines.push(line);
    
    // 递归处理子节点
    for (const childId of elementNode.children || []) {
      traverse(childId, depth + 1);
    }
  }
  
  // 从根节点开始遍历
  const rootNode = map[rootId];
  if (rootNode && !('type' in rootNode)) {
    // 从根节点的子节点开始，跳过根节点本身
    for (const childId of (rootNode as RawDomElementNode).children || []) {
      traverse(childId, 0);
    }
  }
  
  return {
    snapshot: lines.join('\n'),
    refs,
  };
}

/**
 * 获取页面快照
 * @param tabId 目标标签页 ID
 * @param options 快照选项
 * @returns 可访问性树文本和元素引用映射
 */
export async function getSnapshot(tabId: number, options: SnapshotOptions = {}): Promise<SnapshotResult> {
  const { interactive = false } = options;
  
  console.log('[DOMService] Getting snapshot for tab:', tabId, { interactive });
  
  // 1. 注入脚本
  await injectBuildDomTreeScript(tabId);
  
  // 2. 执行 buildDomTree
  const domTreeResult = await executeBuildDomTree(tabId);
  
  // 3. 根据模式选择转换方式
  const snapshotResult = interactive 
    ? convertToAccessibilityTree(domTreeResult)
    : convertToFullTree(domTreeResult);
  
  // 4. 存储 refs 供 click/fill 使用
  lastSnapshotRefs = snapshotResult.refs;
  
  console.log('[DOMService] Snapshot complete:', {
    mode: interactive ? 'interactive' : 'full',
    linesCount: snapshotResult.snapshot.split('\n').length,
    refsCount: Object.keys(snapshotResult.refs).length,
  });
  
  return snapshotResult;
}

/** 存储最后一次 snapshot 的 refs，用于 click/fill 命令 */
let lastSnapshotRefs: Record<string, RefInfo> = {};

/**
 * 当前活动 Frame 的状态
 * null 表示主 frame (frameId = 0)，数字表示子 frame 的 frameId
 */
let activeFrameId: number | null = null;

/**
 * 设置活动 frame
 */
export function setActiveFrameId(frameId: number | null): void {
  activeFrameId = frameId;
  console.log('[DOMService] Active frame changed:', frameId ?? 0);
}

/**
 * 获取当前活动 frame 的 target
 * 用于 chrome.scripting.executeScript
 */
function getFrameTarget(tabId: number): { tabId: number; frameIds?: number[] } {
  if (activeFrameId !== null) {
    return { tabId, frameIds: [activeFrameId] };
  }
  return { tabId };
}

/**
 * 获取 ref 对应的信息
 */
export function getRefInfo(ref: string): RefInfo | null {
  // 支持 "@5" 或 "5" 格式
  const refId = ref.startsWith('@') ? ref.slice(1) : ref;
  return lastSnapshotRefs[refId] || null;
}

/**
 * 点击元素
 * @param tabId 目标标签页 ID
 * @param ref 元素 ref ID（如 "@5" 或 "5"）
 * @returns 被点击元素的 role 和 name
 */
export async function clickElement(tabId: number, ref: string): Promise<{ role: string; name?: string }> {
  const refInfo = getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;
  const target = getFrameTarget(tabId);

  // 使用 chrome.scripting.executeScript 注入点击代码
  const results = await chrome.scripting.executeScript({
    target,
    func: (elementXpath: string) => {
      // 通过 XPath 定位元素
      const result = document.evaluate(
        elementXpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue as HTMLElement | null;

      if (!element) {
        return { success: false, error: 'Element not found by xpath' };
      }

      // 滚动到元素可见
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });

      // 触发点击
      element.click();

      return { success: true };
    },
    args: [xpath],
  });

  const result = results[0]?.result as { success: boolean; error?: string } | undefined;
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to click element');
  }

  console.log('[DOMService] Clicked element:', { ref, role, name });
  return { role, name };
}

/**
 * 悬停在元素上
 * @param tabId 目标标签页 ID
 * @param ref 元素 ref ID（如 "@5" 或 "5"）
 * @returns 被悬停元素的 role 和 name
 */
export async function hoverElement(tabId: number, ref: string): Promise<{ role: string; name?: string }> {
  const refInfo = getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;
  const target = getFrameTarget(tabId);

  // 使用 chrome.scripting.executeScript 注入悬停代码
  const results = await chrome.scripting.executeScript({
    target,
    func: (elementXpath: string) => {
      // 通过 XPath 定位元素
      const result = document.evaluate(
        elementXpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue as HTMLElement | null;

      if (!element) {
        return { success: false, error: 'Element not found by xpath' };
      }

      // 滚动到元素可见
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });

      // 触发悬停事件
      element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      return { success: true };
    },
    args: [xpath],
  });

  const result = results[0]?.result as { success: boolean; error?: string } | undefined;
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to hover element');
  }

  console.log('[DOMService] Hovered element:', { ref, role, name });
  return { role, name };
}

/**
 * 填充输入框
 * @param tabId 目标标签页 ID
 * @param ref 元素 ref ID（如 "@5" 或 "5"）
 * @param text 要填充的文本
 * @returns 被填充元素的 role 和 name
 */
export async function fillElement(tabId: number, ref: string, text: string): Promise<{ role: string; name?: string }> {
  const refInfo = getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;
  const target = getFrameTarget(tabId);

  // 使用 chrome.scripting.executeScript 注入填充代码
  const results = await chrome.scripting.executeScript({
    target,
    func: (elementXpath: string, inputText: string) => {
      // 通过 XPath 定位元素
      const result = document.evaluate(
        elementXpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue as HTMLElement | null;

      if (!element) {
        return { success: false, error: 'Element not found by xpath' };
      }

      // 滚动到元素可见
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });

      // 聚焦元素
      element.focus();

      // 根据元素类型填充
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        // 清空并设置值
        element.value = '';
        element.value = inputText;
        // 触发 input 和 change 事件
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (element.isContentEditable) {
        // contenteditable 元素
        element.textContent = inputText;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        return { success: false, error: 'Element is not fillable' };
      }

      return { success: true };
    },
    args: [xpath, text],
  });

  const result = results[0]?.result as { success: boolean; error?: string } | undefined;
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to fill element');
  }

  console.log('[DOMService] Filled element:', { ref, role, name, textLength: text.length });
  return { role, name };
}

/**
 * 逐字符输入文本（不清空原有内容）
 * @param tabId 目标标签页 ID
 * @param ref 元素 ref ID（如 "@5" 或 "5"）
 * @param text 要输入的文本
 * @returns 被输入元素的 role 和 name
 */
export async function typeElement(tabId: number, ref: string, text: string): Promise<{ role: string; name?: string }> {
  const refInfo = getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;
  const target = getFrameTarget(tabId);

  // 使用 chrome.scripting.executeScript 注入逐字符输入代码
  const results = await chrome.scripting.executeScript({
    target,
    func: (elementXpath: string, inputText: string) => {
      // 通过 XPath 定位元素
      const result = document.evaluate(
        elementXpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue as HTMLElement | null;

      if (!element) {
        return { success: false, error: 'Element not found by xpath' };
      }

      // 滚动到元素可见
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });

      // 聚焦元素
      element.focus();

      // 根据元素类型逐字符输入
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        // 不清空，逐字符追加
        for (const char of inputText) {
          // 模拟 keydown
          element.dispatchEvent(new KeyboardEvent('keydown', {
            key: char,
            bubbles: true,
            cancelable: true,
          }));

          // 追加字符到 value
          element.value += char;

          // 触发 input 事件
          element.dispatchEvent(new InputEvent('input', {
            data: char,
            inputType: 'insertText',
            bubbles: true,
            cancelable: true,
          }));

          // 模拟 keyup
          element.dispatchEvent(new KeyboardEvent('keyup', {
            key: char,
            bubbles: true,
            cancelable: true,
          }));
        }

        // 最后触发 change 事件
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (element.isContentEditable) {
        // contenteditable 元素 - 追加到现有内容
        const selection = window.getSelection();
        const range = document.createRange();
        
        // 移动光标到末尾
        range.selectNodeContents(element);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);

        // 逐字符插入
        for (const char of inputText) {
          document.execCommand('insertText', false, char);
        }
      } else {
        return { success: false, error: 'Element is not typable' };
      }

      return { success: true };
    },
    args: [xpath, text],
  });

  const result = results[0]?.result as { success: boolean; error?: string } | undefined;
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to type in element');
  }

  console.log('[DOMService] Typed in element:', { ref, role, name, textLength: text.length });
  return { role, name };
}

/**
 * 选择下拉框选项
 * @param tabId 目标标签页 ID
 * @param ref 元素 ref ID（如 "@5" 或 "5"）
 * @param value 选项的 value 属性值或显示文本（label）
 * @returns 被选中元素的信息
 */
export async function selectOption(
  tabId: number,
  ref: string,
  value: string
): Promise<{ role: string; name?: string; selectedValue: string; selectedLabel: string }> {
  const refInfo = getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;
  const target = getFrameTarget(tabId);

  // 使用 chrome.scripting.executeScript 注入选择代码
  const results = await chrome.scripting.executeScript({
    target,
    func: (elementXpath: string, selectValue: string) => {
      // 通过 XPath 定位元素
      const result = document.evaluate(
        elementXpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue as HTMLElement | null;

      if (!element) {
        return { success: false, error: 'Element not found by xpath' };
      }

      // 检查是否是 select 元素
      if (!(element instanceof HTMLSelectElement)) {
        return { success: false, error: 'Element is not a <select> element' };
      }

      const selectEl = element;

      // 滚动到元素可见
      selectEl.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });

      // 聚焦元素
      selectEl.focus();

      // 首先尝试通过 value 属性匹配
      let matchedOption: HTMLOptionElement | null = null;
      for (const option of Array.from(selectEl.options)) {
        if (option.value === selectValue) {
          matchedOption = option;
          break;
        }
      }

      // 如果 value 匹配失败，尝试通过 label（显示文本）匹配
      if (!matchedOption) {
        for (const option of Array.from(selectEl.options)) {
          if (option.textContent?.trim() === selectValue) {
            matchedOption = option;
            break;
          }
        }
      }

      // 如果还是没找到，尝试不区分大小写匹配
      if (!matchedOption) {
        const lowerValue = selectValue.toLowerCase();
        for (const option of Array.from(selectEl.options)) {
          if (option.value.toLowerCase() === lowerValue || 
              option.textContent?.trim().toLowerCase() === lowerValue) {
            matchedOption = option;
            break;
          }
        }
      }

      if (!matchedOption) {
        // 收集可用选项供错误提示
        const availableOptions = Array.from(selectEl.options).map(opt => ({
          value: opt.value,
          label: opt.textContent?.trim() || '',
        }));
        return { 
          success: false, 
          error: `Option "${selectValue}" not found. Available options: ${JSON.stringify(availableOptions)}` 
        };
      }

      // 设置选中状态
      selectEl.value = matchedOption.value;

      // 触发 change 事件
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));

      return { 
        success: true, 
        selectedValue: matchedOption.value,
        selectedLabel: matchedOption.textContent?.trim() || matchedOption.value,
      };
    },
    args: [xpath, value],
  });

  const result = results[0]?.result as { 
    success: boolean; 
    error?: string; 
    selectedValue?: string;
    selectedLabel?: string;
  } | undefined;
  
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to select option');
  }

  console.log('[DOMService] Selected option:', { ref, role, name, selectedValue: result.selectedValue });
  return { 
    role, 
    name, 
    selectedValue: result.selectedValue!, 
    selectedLabel: result.selectedLabel! 
  };
}

/**
 * 获取元素文本内容
 * @param tabId 目标标签页 ID
 * @param ref 元素 ref ID（如 "@5" 或 "5"）
 * @returns 元素的文本内容
 */
export async function getElementText(tabId: number, ref: string): Promise<string> {
  const refInfo = getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath } = refInfo;
  const target = getFrameTarget(tabId);

  // 使用 chrome.scripting.executeScript 注入获取文本的代码
  const results = await chrome.scripting.executeScript({
    target,
    func: (elementXpath: string) => {
      // 通过 XPath 定位元素
      const result = document.evaluate(
        elementXpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue as HTMLElement | null;

      if (!element) {
        return { success: false, error: 'Element not found by xpath' };
      }

      // 获取文本内容
      const text = element.textContent || '';

      return { success: true, text: text.trim() };
    },
    args: [xpath],
  });

  const result = results[0]?.result as { success: boolean; text?: string; error?: string } | undefined;
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to get element text');
  }

  console.log('[DOMService] Got element text:', { ref, textLength: result.text?.length });
  return result.text || '';
}

/**
 * 等待元素出现
 * @param tabId 目标标签页 ID
 * @param ref 元素 ref ID
 * @param maxWait 最大等待时间（毫秒），默认 10 秒
 * @param interval 轮询间隔（毫秒），默认 200ms
 */
export async function waitForElement(
  tabId: number,
  ref: string,
  maxWait = 10000,
  interval = 200
): Promise<void> {
  const refInfo = getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath } = refInfo;
  const target = getFrameTarget(tabId);
  let elapsed = 0;

  while (elapsed < maxWait) {
    const results = await chrome.scripting.executeScript({
      target,
      func: (elementXpath: string) => {
        const result = document.evaluate(
          elementXpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue !== null;
      },
      args: [xpath],
    });

    const found = results[0]?.result;
    if (found) {
      console.log('[DOMService] Element found:', { ref, elapsed });
      return;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
    elapsed += interval;
  }

  throw new Error(`Timeout waiting for element @${ref} after ${maxWait}ms`);
}

/**
 * 勾选复选框
 * @param tabId 目标标签页 ID
 * @param ref 元素 ref ID（如 "@5" 或 "5"）
 * @returns 被勾选元素的 role、name 和是否之前已勾选
 */
export async function checkElement(tabId: number, ref: string): Promise<{ role: string; name?: string; wasAlreadyChecked: boolean }> {
  const refInfo = getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;
  const target = getFrameTarget(tabId);

  const results = await chrome.scripting.executeScript({
    target,
    func: (elementXpath: string) => {
      const result = document.evaluate(
        elementXpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue as HTMLElement | null;

      if (!element) {
        return { success: false, error: 'Element not found by xpath' };
      }

      // 验证元素类型
      if (!(element instanceof HTMLInputElement)) {
        return { success: false, error: 'Element is not an input element' };
      }

      const inputType = element.type.toLowerCase();
      if (inputType !== 'checkbox' && inputType !== 'radio') {
        return { success: false, error: `Element is not a checkbox or radio (type: ${inputType})` };
      }

      // 检查是否已勾选
      const wasAlreadyChecked = element.checked;

      // 如果未勾选，则勾选
      if (!wasAlreadyChecked) {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }

      return { success: true, wasAlreadyChecked };
    },
    args: [xpath],
  });

  const result = results[0]?.result as { success: boolean; wasAlreadyChecked?: boolean; error?: string } | undefined;
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to check element');
  }

  console.log('[DOMService] Checked element:', { ref, role, name, wasAlreadyChecked: result.wasAlreadyChecked });
  return { role, name, wasAlreadyChecked: result.wasAlreadyChecked ?? false };
}

/**
 * 取消勾选复选框
 * @param tabId 目标标签页 ID
 * @param ref 元素 ref ID（如 "@5" 或 "5"）
 * @returns 被取消勾选元素的 role、name 和是否之前未勾选
 */
export async function uncheckElement(tabId: number, ref: string): Promise<{ role: string; name?: string; wasAlreadyUnchecked: boolean }> {
  const refInfo = getRefInfo(ref);
  if (!refInfo) {
    throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  }

  const { xpath, role, name } = refInfo;
  const target = getFrameTarget(tabId);

  const results = await chrome.scripting.executeScript({
    target,
    func: (elementXpath: string) => {
      const result = document.evaluate(
        elementXpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue as HTMLElement | null;

      if (!element) {
        return { success: false, error: 'Element not found by xpath' };
      }

      // 验证元素类型
      if (!(element instanceof HTMLInputElement)) {
        return { success: false, error: 'Element is not an input element' };
      }

      const inputType = element.type.toLowerCase();
      if (inputType !== 'checkbox' && inputType !== 'radio') {
        return { success: false, error: `Element is not a checkbox or radio (type: ${inputType})` };
      }

      // 检查是否未勾选
      const wasAlreadyUnchecked = !element.checked;

      // 如果已勾选，则取消勾选
      if (!wasAlreadyUnchecked) {
        element.checked = false;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }

      return { success: true, wasAlreadyUnchecked };
    },
    args: [xpath],
  });

  const result = results[0]?.result as { success: boolean; wasAlreadyUnchecked?: boolean; error?: string } | undefined;
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to uncheck element');
  }

  console.log('[DOMService] Unchecked element:', { ref, role, name, wasAlreadyUnchecked: result.wasAlreadyUnchecked });
  return { role, name, wasAlreadyUnchecked: result.wasAlreadyUnchecked ?? false };
}

/**
 * 移除页面上的高亮元素
 */
export async function removeHighlights(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const container = document.getElementById('playwright-highlight-container');
        if (container) {
          container.remove();
        }
        
        const highlightedElements = document.querySelectorAll('[browser-user-highlight-id^="playwright-highlight-"]');
        for (const el of Array.from(highlightedElements)) {
          el.removeAttribute('browser-user-highlight-id');
        }
      },
    });
  } catch (error) {
    console.error('[DOMService] Failed to remove highlights:', error);
  }
}
