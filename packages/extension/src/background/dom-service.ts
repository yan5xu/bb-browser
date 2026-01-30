/**
 * DOM Service for bb-browser Extension
 * 
 * 封装 buildDomTree 的注入和调用逻辑，将 DOM 树转换为可访问性树文本格式。
 * 
 * v2.0: 本文件只保留 snapshot 相关逻辑，其他 DOM 操作已迁移到 cdp-dom-service.ts
 */

// ============================================================================
// 类型定义
// ============================================================================

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

/** Snapshot 选项 */
export interface SnapshotOptions {
  /** 是否只输出可交互元素，默认 false（输出完整树） */
  interactive?: boolean;
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

// ============================================================================
// 状态管理
// ============================================================================

/** 存储最后一次 snapshot 的 refs，用于后续操作 */
let lastSnapshotRefs: Record<string, RefInfo> = {};

/** 当前活动 Frame 的 frameId（null 表示主 frame） */
let activeFrameId: number | null = null;

// ============================================================================
// 公共 API
// ============================================================================

/**
 * 设置活动 frame
 */
export function setActiveFrameId(frameId: number | null): void {
  activeFrameId = frameId;
  console.log('[DOMService] Active frame changed:', frameId ?? 0);
}

/**
 * 获取 ref 对应的信息
 */
export function getRefInfo(ref: string): RefInfo | null {
  const refId = ref.startsWith('@') ? ref.slice(1) : ref;
  return lastSnapshotRefs[refId] || null;
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
  
  // 4. 存储 refs 供后续操作使用
  lastSnapshotRefs = snapshotResult.refs;
  
  console.log('[DOMService] Snapshot complete:', {
    mode: interactive ? 'interactive' : 'full',
    linesCount: snapshotResult.snapshot.split('\n').length,
    refsCount: Object.keys(snapshotResult.refs).length,
  });
  
  return snapshotResult;
}

// ============================================================================
// 内部函数 - 脚本注入
// ============================================================================

/**
 * 获取当前活动 frame 的 target
 */
function getFrameTarget(tabId: number): { tabId: number; frameIds?: number[] } {
  if (activeFrameId !== null) {
    return { tabId, frameIds: [activeFrameId] };
  }
  return { tabId };
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

// ============================================================================
// 内部函数 - 角色和名称计算
// ============================================================================

/**
 * 将 tagName 转换为可访问性角色
 */
function getRole(node: RawDomElementNode): string {
  const tagName = node.tagName.toLowerCase();
  const role = node.attributes?.role;
  
  if (role) return role;
  
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
  
  if (attrs['aria-label']) return attrs['aria-label'];
  if (attrs.title) return attrs.title;
  if (attrs.placeholder) return attrs.placeholder;
  if (attrs.alt) return attrs.alt;
  if (attrs.value) return attrs.value;
  
  const textContent = collectTextContent(node, nodeMap);
  if (textContent) return textContent;
  
  if (attrs.name) return attrs.name;
  
  return undefined;
}

/**
 * 收集节点的文本内容
 */
function collectTextContent(
  node: RawDomElementNode, 
  nodeMap: Record<string, RawDomTreeNode>, 
  maxDepth = 5
): string {
  const texts: string[] = [];
  
  function collect(nodeId: string, depth: number): void {
    if (depth > maxDepth) return;
    
    const currentNode = nodeMap[nodeId];
    if (!currentNode) return;
    
    if ('type' in currentNode && currentNode.type === 'TEXT_NODE') {
      const text = currentNode.text.trim();
      if (text) texts.push(text);
      return;
    }
    
    const elementNode = currentNode as RawDomElementNode;
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
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * 检查节点 A 是否是节点 B 的祖先
 */
function isAncestor(ancestorId: string, descendantId: string, nodeMap: Record<string, RawDomTreeNode>): boolean {
  const descendant = nodeMap[descendantId];
  if (!descendant || 'type' in descendant) return false;
  
  const ancestor = nodeMap[ancestorId];
  if (!ancestor || 'type' in ancestor) return false;
  
  const ancestorElement = ancestor as RawDomElementNode;
  const elementNode = descendant as RawDomElementNode;
  if (!ancestorElement.xpath || !elementNode.xpath) return false;
  
  return elementNode.xpath.startsWith(ancestorElement.xpath + '/');
}

// ============================================================================
// 内部函数 - 树转换
// ============================================================================

/**
 * 将 DOM 树转换为可访问性树文本格式（只含可交互元素）
 */
function convertToAccessibilityTree(result: BuildDomTreeResult): SnapshotResult {
  const lines: string[] = [];
  const refs: Record<string, RefInfo> = {};
  const { map } = result;
  
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
  
  // 收集所有节点的 name 和 role
  const nodeIdToInfo = new Map<string, { name: string | undefined; role: string }>();
  for (const { id, node } of interactiveNodes) {
    nodeIdToInfo.set(id, { 
      name: getAccessibleName(node, map), 
      role: getRole(node) 
    });
  }
  
  // 过滤冗余节点
  const nonSemanticTags = new Set(['span', 'div', 'i', 'b', 'em', 'strong', 'small', 'svg', 'path', 'g']);
  const filterableTags = new Set(['label']);
  const filteredNodes: Array<{ id: string; node: RawDomElementNode }> = [];
  
  for (const item of interactiveNodes) {
    const { id, node } = item;
    const info = nodeIdToInfo.get(id)!;
    const tagName = node.tagName.toLowerCase();
    
    // 规则1: 过滤没有名称的非语义化元素
    if ((nonSemanticTags.has(tagName) || tagName === 'a') && !info.name) continue;
    
    // 规则2: 过滤 label 元素
    if (filterableTags.has(tagName)) continue;
    
    // 规则3: 过滤可交互元素的非语义化子元素
    let isChildOfInteractive = false;
    for (const otherItem of interactiveNodes) {
      if (otherItem.id === id) continue;
      const otherTagName = otherItem.node.tagName.toLowerCase();
      if (['a', 'button'].includes(otherTagName) && 
          nonSemanticTags.has(tagName) && 
          isAncestor(otherItem.id, id, map)) {
        isChildOfInteractive = true;
        break;
      }
    }
    if (isChildOfInteractive) continue;
    
    // 规则4: 过滤与祖先同名的节点
    let isDuplicate = false;
    for (const otherItem of interactiveNodes) {
      if (otherItem.id === id) continue;
      const otherInfo = nodeIdToInfo.get(otherItem.id)!;
      if (isAncestor(otherItem.id, id, map) && 
          info.name && otherInfo.name && 
          info.name === otherInfo.name) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) filteredNodes.push(item);
  }
  
  // 生成输出
  for (const { id, node } of filteredNodes) {
    const refId = String(node.highlightIndex);
    const info = nodeIdToInfo.get(id)!;
    
    let line = `- ${info.role}`;
    if (info.name) line += ` "${truncateText(info.name)}"`;
    line += ` [ref=${refId}]`;
    
    lines.push(line);
    refs[refId] = {
      xpath: node.xpath || '',
      role: info.role,
      name: info.name ? truncateText(info.name, 100) : undefined,
      tagName: node.tagName,
    };
  }
  
  return { snapshot: lines.join('\n'), refs };
}

/**
 * 将 DOM 树转换为完整树文本格式（包含所有元素和文本节点）
 */
function convertToFullTree(result: BuildDomTreeResult): SnapshotResult {
  const lines: string[] = [];
  const refs: Record<string, RefInfo> = {};
  const { rootId, map } = result;
  
  const skipTags = new Set([
    'script', 'style', 'noscript', 'svg', 'path', 'g', 'defs', 
    'clippath', 'lineargradient', 'stop', 'symbol', 'use', 'meta', 'link', 'head'
  ]);
  
  function traverse(nodeId: string, depth: number): void {
    const node = map[nodeId];
    if (!node) return;
    
    const indent = '  '.repeat(depth);
    
    // 文本节点
    if ('type' in node && node.type === 'TEXT_NODE') {
      if (!node.isVisible) return;
      const text = node.text.trim();
      if (!text) return;
      const displayText = text.length > 100 ? text.slice(0, 97) + '...' : text;
      lines.push(`${indent}- text: ${displayText}`);
      return;
    }
    
    // 元素节点
    const elementNode = node as RawDomElementNode;
    const tagName = elementNode.tagName.toLowerCase();
    
    if (elementNode.isVisible === false) return;
    if (skipTags.has(tagName)) return;
    
    const role = getRole(elementNode);
    const name = getAccessibleName(elementNode, map);
    const hasRef = elementNode.highlightIndex !== undefined && elementNode.highlightIndex !== null;
    
    let line = `${indent}- ${role}`;
    if (name) {
      const displayName = name.length > 50 ? name.slice(0, 47) + '...' : name;
      line += ` "${displayName}"`;
    }
    if (hasRef) {
      const refId = String(elementNode.highlightIndex);
      line += ` [ref=${refId}]`;
      refs[refId] = {
        xpath: elementNode.xpath || '',
        role,
        name: name ? (name.length > 100 ? name.slice(0, 97) + '...' : name) : undefined,
        tagName: elementNode.tagName,
      };
    }
    
    lines.push(line);
    
    for (const childId of elementNode.children || []) {
      traverse(childId, depth + 1);
    }
  }
  
  const rootNode = map[rootId];
  if (rootNode && !('type' in rootNode)) {
    for (const childId of (rootNode as RawDomElementNode).children || []) {
      traverse(childId, 0);
    }
  }
  
  return { snapshot: lines.join('\n'), refs };
}
