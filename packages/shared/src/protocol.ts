/**
 * CLI 与 Chrome Extension 之间的通信协议类型定义
 */

/** 支持的操作类型 */
export type ActionType =
  | "open"
  | "snapshot"
  | "click"
  | "hover"
  | "fill"
  | "type"
  | "check"
  | "uncheck"
  | "select"
  | "get"
  | "screenshot"
  | "close"
  | "wait"
  | "press"
  | "scroll"
  | "back"
  | "forward"
  | "refresh"
  | "eval"
  | "frame"
  | "frame_main";

/** 请求类型 */
export interface Request {
  /** 请求唯一标识 */
  id: string;
  /** 操作类型 */
  action: ActionType;
  /** 目标 URL（open 操作时必填） */
  url?: string;
  /** 元素引用（click, fill, get 操作时使用） */
  ref?: string;
  /** 输入文本（fill 操作时使用） */
  text?: string;
  /** 获取属性类型（get 操作时使用） */
  attribute?: string;
  /** 截图保存路径（screenshot 操作时使用） */
  path?: string;
  /** 是否只输出可交互元素（snapshot 命令使用） */
  interactive?: boolean;
  /** JavaScript 代码（eval 命令使用） */
  script?: string;
  /** 选项值（select 命令使用） */
  value?: string;
  /** CSS 选择器（frame 命令使用，定位 iframe） */
  selector?: string;
}

/** 元素引用信息 */
export interface RefInfo {
  /** 元素的 XPath */
  xpath: string;
  /** 可访问性角色 */
  role: string;
  /** 可访问名称 */
  name?: string;
  /** 标签名 */
  tagName: string;
}

/** Snapshot 命令返回的数据 */
export interface SnapshotData {
  /** 文本格式的可访问性树 */
  snapshot: string;
  /** 元素引用映射，key 为 ref ID */
  refs: Record<string, RefInfo>;
}

/** 响应数据 */
export interface ResponseData {
  /** 页面标题 */
  title?: string;
  /** 当前 URL */
  url?: string;
  /** Tab ID */
  tabId?: number;
  /** Snapshot 数据（snapshot 操作返回） */
  snapshotData?: SnapshotData;
  /** 获取的文本或属性值（get 操作返回） */
  value?: string;
  /** 截图路径（screenshot 操作返回） */
  screenshotPath?: string;
  /** eval 执行结果 */
  result?: unknown;
  /** Frame 信息（frame 命令返回） */
  frameInfo?: {
    /** iframe 的 CSS 选择器 */
    selector?: string;
    /** iframe 的 name 属性 */
    name?: string;
    /** iframe 的 URL */
    url?: string;
    /** frame ID */
    frameId?: number;
  };
}

/** 响应类型 */
export interface Response {
  /** 对应请求的 ID */
  id: string;
  /** 操作是否成功 */
  success: boolean;
  /** 成功时返回的数据 */
  data?: ResponseData;
  /** 失败时的错误信息 */
  error?: string;
}

/** SSE 事件类型 */
export type SSEEventType = "connected" | "heartbeat" | "command";

/** SSE 事件数据 */
export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
}

/** Daemon 状态 */
export interface DaemonStatus {
  running: boolean;
  extensionConnected: boolean;
  pendingRequests: number;
  uptime: number;
}

/**
 * 生成唯一请求 ID
 * @returns UUID v4 格式的字符串
 */
export function generateId(): string {
  return crypto.randomUUID();
}
