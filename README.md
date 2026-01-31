# bb-browser

面向 AI Agent 的浏览器自动化 CLI 工具。

## 核心特性

- **复用用户登录态** - 运行在用户的浏览器中，自动复用已登录的网站（Gmail, Twitter, 内部系统等）
- **AI Agent 友好** - 简洁的 CLI 接口，支持 JSON 输出，Ref 系统方便元素引用
- **反爬绕过** - 使用 chrome.debugger API，避免 Playwright 等工具的自动化指纹检测

## 架构

```
AI Agent (Claude, GPT, etc.)
       │ CLI 命令
       ▼
bb-browser CLI ──HTTP──▶ Daemon ──SSE──▶ Chrome Extension
                                              │
                                              ▼ chrome.debugger (CDP)
                                         用户浏览器
                                    (已登录的网站、Cookies)
```

## 安装

### 方式 1：npm 安装（推荐）

```bash
npm install -g bb-browser
```

### 方式 2：从源码构建

```bash
git clone https://github.com/yan5xu/bb-browser.git
cd bb-browser
pnpm install
pnpm build
```

### 加载 Chrome 扩展

**必须步骤**：CLI 需要配合 Chrome 扩展使用。

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」（右上角开关）
3. 点击「加载已解压的扩展程序」
4. 选择扩展目录：
   - npm 安装：`node_modules/bb-browser/extension/`
   - 源码构建：`packages/extension/dist/`
5. 确认扩展已启用

## 使用

### 1. 启动 Daemon

```bash
# 前台启动（查看日志）
bb-browser daemon

# 或使用别名
bb-browser start
```

### 2. 基本操作

```bash
# 打开网页
bb-browser open https://example.com

# 获取页面快照（可交互元素）
bb-browser snapshot -i

# 输出示例：
# - link "Learn more" [ref=0]
# - button "Submit" [ref=1]
# - textbox "Search" [ref=2]

# 点击元素
bb-browser click @0

# 填充输入框
bb-browser fill @2 "search query"

# 按键
bb-browser press Enter
```

### 3. 完整命令列表

| 命令 | 说明 | 示例 |
|------|------|------|
| `open <url>` | 打开 URL | `bb-browser open https://x.com` |
| `snapshot` | 获取页面快照 | `bb-browser snapshot -i` |
| `click <ref>` | 点击元素 | `bb-browser click @5` |
| `hover <ref>` | 悬停元素 | `bb-browser hover @3` |
| `fill <ref> <text>` | 填充输入框（清空后填入） | `bb-browser fill @2 "hello"` |
| `type <ref> <text>` | 逐字符输入（追加） | `bb-browser type @2 " world"` |
| `check <ref>` | 勾选复选框 | `bb-browser check @7` |
| `uncheck <ref>` | 取消勾选 | `bb-browser uncheck @7` |
| `select <ref> <val>` | 下拉框选择 | `bb-browser select @4 "option1"` |
| `eval "<js>"` | 执行 JavaScript | `bb-browser eval "document.title"` |
| `get text <ref>` | 获取元素文本 | `bb-browser get text @5` |
| `get url` | 获取当前 URL | `bb-browser get url` |
| `get title` | 获取页面标题 | `bb-browser get title` |
| `screenshot [path]` | 截图 | `bb-browser screenshot ./shot.png` |
| `wait <ms\|@ref>` | 等待时间或元素 | `bb-browser wait 2000` |
| `press <key>` | 按键 | `bb-browser press Enter` |
| `scroll <dir> [px]` | 滚动 | `bb-browser scroll down 500` |
| `back` | 后退 | `bb-browser back` |
| `forward` | 前进 | `bb-browser forward` |
| `refresh` | 刷新 | `bb-browser refresh` |
| `close` | 关闭标签页 | `bb-browser close` |

### 4. 标签页管理

```bash
# 列出所有标签页
bb-browser tab

# 新建标签页
bb-browser tab new https://google.com

# 切换到第 2 个标签页
bb-browser tab 2

# 关闭当前标签页
bb-browser tab close
```

### 5. iframe 支持

```bash
# 切换到 iframe（通过选择器）
bb-browser frame "#iframe-id"
bb-browser frame "[name='content']"

# 返回主 frame
bb-browser frame main
```

### 6. 对话框处理

```bash
# 接受 alert/confirm
bb-browser dialog accept

# 接受 prompt 并输入文本
bb-browser dialog accept "input text"

# 拒绝对话框
bb-browser dialog dismiss
```

### 7. 网络监控

```bash
# 查看网络请求
bb-browser network requests

# 按关键词过滤
bb-browser network requests api

# 拦截并阻止请求
bb-browser network route "*ads*" --abort

# Mock 响应
bb-browser network route "/api/user" --body '{"name":"test"}'

# 移除拦截规则
bb-browser network unroute

# 清空请求记录
bb-browser network clear
```

### 8. 调试

```bash
# 查看控制台消息
bb-browser console

# 清空控制台
bb-browser console --clear

# 查看 JS 错误
bb-browser errors

# 清空错误记录
bb-browser errors --clear
```

### 9. JSON 输出

所有命令支持 `--json` 参数，方便程序解析：

```bash
bb-browser snapshot -i --json
# {"success":true,"data":{"snapshot":"...","refs":{...}}}

bb-browser get url --json
# {"success":true,"data":"https://example.com"}
```

## CDP 开发模式

以 CDP 调试模式启动 Chrome，支持 `reload` 命令热重载扩展：

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug-profile

# 然后加载扩展，之后可以热重载
bb-browser reload
```

## 项目结构

```
bb-browser/
├── packages/
│   ├── cli/          # CLI 工具
│   ├── daemon/       # HTTP Daemon（CLI 与扩展的桥梁）
│   ├── extension/    # Chrome 扩展
│   └── shared/       # 共享类型
└── README.md
```

## 技术栈

- **CLI**: TypeScript, Commander.js
- **Daemon**: Node.js HTTP Server, SSE
- **Extension**: Chrome Manifest V3, chrome.debugger API
- **构建**: pnpm, Turbo, Vite, tsup

## License

MIT
