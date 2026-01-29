/**
 * reload 命令 - 通过 CDP 重载扩展
 * 用法：bb-browser reload
 * 
 * 需要 Chrome 以 --remote-debugging-port=9222 启动
 * 并且 chrome://extensions 页面需要打开
 */

import WebSocket from "ws";

export interface ReloadOptions {
  json?: boolean;
  port?: number;
}

const EXTENSION_NAME = "bb-browser";

export async function reloadCommand(
  options: ReloadOptions = {}
): Promise<void> {
  const port = options.port || 9222;
  
  try {
    // 获取所有 targets
    const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!listRes.ok) {
      throw new Error(`CDP 未启用。请用 --remote-debugging-port=${port} 启动 Chrome`);
    }
    const list = await listRes.json();
    
    // 找到 chrome://extensions 页面
    const extPage = list.find((t: any) => 
      t.type === "page" && 
      t.url.includes("chrome://extensions")
    );
    
    if (!extPage) {
      throw new Error("请先打开 chrome://extensions 页面");
    }
    
    // 连接到 chrome://extensions 页面
    const result = await new Promise<{ success: boolean; message: string; extensionId?: string }>((resolve, reject) => {
      const ws = new WebSocket(extPage.webSocketDebuggerUrl);
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(new Error("CDP 连接超时"));
        }
      }, 10000);
      
      ws.on("open", () => {
        // 通过 developerPrivate API 查找 bb-browser 扩展并重载
        const script = `
          (async function() {
            if (!chrome || !chrome.developerPrivate) {
              return { error: 'developerPrivate API not available' };
            }
            
            try {
              const exts = await chrome.developerPrivate.getExtensionsInfo();
              const bbExt = exts.find(e => e.name === '${EXTENSION_NAME}');
              
              if (!bbExt) {
                return { error: '${EXTENSION_NAME} 扩展未安装' };
              }
              
              if (bbExt.state !== 'ENABLED') {
                return { error: '${EXTENSION_NAME} 扩展已禁用' };
              }
              
              await chrome.developerPrivate.reload(bbExt.id, {failQuietly: true});
              return { success: true, extensionId: bbExt.id };
            } catch (e) {
              return { error: e.message };
            }
          })()
        `;
        
        ws.send(JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { 
            expression: script,
            awaitPromise: true,
            returnByValue: true
          }
        }));
      });
      
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.id === 1) {
          clearTimeout(timeout);
          resolved = true;
          ws.close();
          
          const value = msg.result?.result?.value;
          if (value?.success) {
            resolve({ 
              success: true, 
              message: "扩展已重载",
              extensionId: value.extensionId 
            });
          } else if (value?.error) {
            reject(new Error(value.error));
          } else {
            reject(new Error(`重载失败: ${JSON.stringify(value)}`));
          }
        }
      });
      
      ws.on("error", (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          reject(new Error(`CDP 连接失败: ${err.message}`));
        }
      });
    });
    
    if (options.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`${result.message} (${result.extensionId})`);
    }
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: message }));
    } else {
      console.error(`错误: ${message}`);
    }
    process.exit(1);
  }
}
