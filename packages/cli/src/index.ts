/**
 * bb-browser CLI 入口
 *
 * 用法：
 *   bb-browser open <url>     打开指定 URL
 *   bb-browser snapshot       获取当前页面快照
 *   bb-browser daemon         前台启动 Daemon
 *   bb-browser start          前台启动 Daemon（别名）
 *   bb-browser stop           停止 Daemon
 *   bb-browser status         查看 Daemon 状态
 *   bb-browser --help         显示帮助信息
 *   bb-browser --version      显示版本号
 *
 * 全局选项：
 *   --json                    以 JSON 格式输出
 */

import { openCommand } from "./commands/open.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { clickCommand } from "./commands/click.js";
import { fillCommand } from "./commands/fill.js";
import { screenshotCommand } from "./commands/screenshot.js";
import { daemonCommand, stopCommand, statusCommand } from "./commands/daemon.js";
import { reloadCommand } from "./commands/reload.js";

const VERSION = "0.0.1";

const HELP_TEXT = `
bb-browser - AI Agent 浏览器自动化工具

用法：
  bb-browser <command> [options]

命令：
  open <url>        打开指定 URL
  snapshot          获取当前页面快照（默认完整树）
  click <ref>       点击元素（ref 如 @5 或 5）
  fill <ref> <text> 填充输入框
  screenshot [path] 截取当前页面
  daemon            前台启动 Daemon
  start             前台启动 Daemon（daemon 的别名）
  stop              停止 Daemon
  status            查看 Daemon 状态
  reload            重载扩展（需要 CDP 模式）

选项：
  --json          以 JSON 格式输出
  -i, --interactive 只输出可交互元素（snapshot 命令）
  --help, -h      显示帮助信息
  --version, -v   显示版本号

示例：
  bb-browser open https://example.com
  bb-browser snapshot --json
  bb-browser click @5
  bb-browser fill @3 "hello world"
  bb-browser screenshot ./page.png
  bb-browser daemon
  bb-browser stop
`.trim();

interface ParsedArgs {
  command: string | null;
  args: string[];
  flags: {
    json: boolean;
    help: boolean;
    version: boolean;
    interactive: boolean;
  };
}

/**
 * 解析命令行参数
 */
function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // 跳过 node 和脚本路径

  const result: ParsedArgs = {
    command: null,
    args: [],
    flags: {
      json: false,
      help: false,
      version: false,
      interactive: false,
    },
  };

  for (const arg of args) {
    if (arg === "--json") {
      result.flags.json = true;
    } else if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
    } else if (arg === "--interactive" || arg === "-i") {
      result.flags.interactive = true;
    } else if (arg.startsWith("-")) {
      // 未知选项，忽略
    } else if (result.command === null) {
      result.command = arg;
    } else {
      result.args.push(arg);
    }
  }

  return result;
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  // 处理全局选项
  if (parsed.flags.version) {
    console.log(VERSION);
    return;
  }

  if (parsed.flags.help || !parsed.command) {
    console.log(HELP_TEXT);
    return;
  }

  // 路由到对应命令
  try {
    switch (parsed.command) {
      case "open": {
        const url = parsed.args[0];
        if (!url) {
          console.error("错误：缺少 URL 参数");
          console.error("用法：bb-browser open <url>");
          process.exit(1);
        }
        await openCommand(url, { json: parsed.flags.json });
        break;
      }

      case "snapshot": {
        await snapshotCommand({ json: parsed.flags.json, interactive: parsed.flags.interactive });
        break;
      }

      case "click": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("错误：缺少 ref 参数");
          console.error("用法：bb-browser click <ref>");
          console.error("示例：bb-browser click @5");
          process.exit(1);
        }
        await clickCommand(ref, { json: parsed.flags.json });
        break;
      }

      case "fill": {
        const ref = parsed.args[0];
        const text = parsed.args[1];
        if (!ref) {
          console.error("错误：缺少 ref 参数");
          console.error("用法：bb-browser fill <ref> <text>");
          console.error('示例：bb-browser fill @3 "hello world"');
          process.exit(1);
        }
        if (text === undefined) {
          console.error("错误：缺少 text 参数");
          console.error("用法：bb-browser fill <ref> <text>");
          console.error('示例：bb-browser fill @3 "hello world"');
          process.exit(1);
        }
        await fillCommand(ref, text, { json: parsed.flags.json });
        break;
      }

      case "daemon":
      case "start": {
        await daemonCommand({ json: parsed.flags.json });
        break;
      }

      case "stop": {
        await stopCommand({ json: parsed.flags.json });
        break;
      }

      case "status": {
        await statusCommand({ json: parsed.flags.json });
        break;
      }

      case "reload": {
        await reloadCommand({ json: parsed.flags.json });
        break;
      }

      case "screenshot": {
        const outputPath = parsed.args[0];
        await screenshotCommand(outputPath, { json: parsed.flags.json });
        break;
      }

      default: {
        console.error(`错误：未知命令 "${parsed.command}"`);
        console.error("运行 bb-browser --help 查看可用命令");
        process.exit(1);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (parsed.flags.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: message,
        })
      );
    } else {
      console.error(`错误：${message}`);
    }

    process.exit(1);
  }
}

main();
