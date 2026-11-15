# CodeBuddy 对话导航条

给 CodeBuddy IDE 的聊天面板加一条**轮次导航条**：窗口右侧一列小刻度，每一轮对话对应一根，点哪根就跳到哪一轮。

解决的是很具体的痛点：一段 30 轮的对话，想翻回第 5 轮看看当时说过什么，只能一路往上滚，滚半天还容易滚过头。

```
┌──────────────────────────────┐
│  用户：帮我把 xxx 改一下      │
│  CodeBuddy：好的，我看了…    │  ▌  ← 第 1 轮
│                              │  ▌
│  用户：那 yyy 呢             │  █  ← 第 5 轮（当前，蓝色）
│  CodeBuddy：……               │  ▌
│                              │  ▌  ← 第 12 轮
└──────────────────────────────┘
```

## 特性

- **每轮一个刻度**，越过越往下；当前所在轮次蓝色高亮
- **点击直达**，目标轮次精确对齐到面板顶部
- **悬停有提示**，显示「第 N 轮 · 提问前 60 字」
- **整个纵向条带连续命中**，鼠标落在两根线之间也算，不会出现"放偏了全都不亮"
- **默认半透明**，不遮挡后面的文字；鼠标移上去才变亮
- **位置自适应**：按滚动条实际宽度让位，永远贴着滚动条左侧但不压住它
- **自动跟随**：新消息、切换会话、面板重载都会自动重建
- 不修改 CodeBuddy 任何安装文件，关掉 IDE 即消失

## 原理

CodeBuddy IDE 是 **Electron 打包的 VS Code 1.106 分叉**，它的聊天界面是 Chromium 渲染的 webview，不是原生绘制。

所以只要启动时给主进程加一个参数：

```
--remote-debugging-port=9333
```

Electron 就会在 `127.0.0.1:9333` 开放 **Chrome DevTools 协议**（CDP）端口。外部脚本连上去后，可以在聊天页面的 DOM 里执行任意 JS——包括插入一个 `position: fixed` 的 div。

三件关键的事：

| 需要什么 | 怎么拿 |
|---|---|
| 一共多少轮 | 沿 DOM 节点上的 `__reactFiber$xxx` 向上找，读虚拟列表的 `totalCount` |
| 每轮的提问原文 | 同一个 fiber 上的 `messages` 数组，取 `messageType === 'user'` 的 `content` |
| 怎么跳到第 N 轮 | 拿到列表自己的 `scrollToIndex({index, align:'start'})` 句柄；拿不到时降级为改 `scrollTop` + 派发 `scroll` 事件，再用实际位置迭代校正 |

### 一个绕不开的坑：历史懒加载

CodeBuddy 打开会话时**只把最近几轮放进内存**，更早的要你往上滚才逐批加载。实测：

```
刚打开：        total=5
滚到顶部 1 次：  total=6
滚到顶部 2 次：  total=8
滚到顶部 3 次：  total=11   ← 到底了
```

导航条只能数到内存里已有的轮次，所以刚打开时只会显示 5 根。为此注入器会在初始化时**自动预加载**：反复滚到顶部触发它自己的加载，直到轮数不再增长，再回到底部。

副作用是打开会话时画面会自己往上翻几秒（会话越长越久）。这是 `PrintWindow` 式的取舍，暂时没有更安静的办法——因为加载只能靠滚动触发。

## 安装

### 1. 让 CodeBuddy 带调试端口启动

关闭**所有** CodeBuddy 窗口（单实例锁：只要还有一个实例在，新启动的参数会被转发过去然后退出，端口不会开），然后执行：

```cmd
restart_debug.cmd
```

它会关掉所有残留进程，再带 `--remote-debugging-port=9333` 启动。

或者永久改快捷方式（桌面 + 开始菜单都改，原参数会备份，可还原）：

```powershell
powershell -ExecutionPolicy Bypass -File set_shortcut.ps1
```

之后正常双击图标启动即可。

### 2. 启动注入器

```cmd
wscript.exe start_hidden.vbs
```

或者注册开机自启（写 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`）：

```powershell
powershell -ExecutionPolicy Bypass -File autostart.ps1
```

注入器会在后台轮询端口，IDE 还没启动也没关系，等它起来就自动连上。

### 3. 验证

```cmd
node list_targets.mjs 9333
```

能看到 `page` 和 `iframe` 类型的 target 就说明端口通了。然后打开 CodeBuddy 的聊天面板，右侧应该出现刻度。

## 使用

| 操作 | 效果 |
|---|---|
| 点击刻度 | 跳到那一轮，对齐到面板顶部，目标轮次短暂描边 |
| 悬停在刻度附近 | 就近那根变蓝加长，右侧显示「第 N 轮 · 提问前 60 字」 |
| 悬停在两根之间 | 一样会亮（整条纵向条带无缝命中） |

## 配置

全部在 `nav_payload.js` 顶部的 CSS 字符串里：

```js
// 尺寸
width:11px; height:2px;              // 刻度长短粗细
// 透明度
opacity:.42;                          // 默认半透明程度
// 位置
'right:12px; top:8%'                  // right 会被运行时按滚动条宽度覆盖
// 预加载
setTimeout(preloadHistory, 400);      // 改成 // setTimeout(...) 可关闭预加载
```

**改完必须同时修改版本号**，否则注入器认为还是同一版，不会重建：

```js
var VERSION = '2.0';   // 改成 2.1、2.2 ……
```

保存后 2.5 秒内自动生效（注入器会检测文件修改时间），不需要重启。

## 卸载

```powershell
# 1. 移除开机自启
powershell -ExecutionPolicy Bypass -File autostart.ps1 -Remove

# 2. 还原快捷方式（去掉调试端口参数）
powershell -ExecutionPolicy Bypass -File set_shortcut.ps1 -Restore

# 3. 结束注入器
Get-Process node | Where-Object { $_.CommandLine -like '*tocnav.mjs*' } | Stop-Process

# 4. 关闭所有 CodeBuddy 窗口后重新打开（不带端口）
```

导航条本身不需要卸载——它只存在于运行时，IDE 关掉就没了。

## 文件说明

| 文件 | 作用 |
|---|---|
| `cdp.mjs` | 极简 CDP 客户端（零依赖，用 Node 内置 WebSocket） |
| `tocnav.mjs` | 常驻注入器：轮询端口、连接 target、注入、断线重连、单实例锁、日志 |
| `nav_payload.js` | 注入到页面的核心脚本：读轮数、画刻度、跳转、预加载 |
| `launch_debug.cmd` | 带端口启动（会先检查是否已有实例） |
| `restart_debug.cmd` | 关掉所有实例再带端口启动 |
| `set_shortcut.ps1` | 给快捷方式加/去调试端口参数，原参数自动备份 |
| `start_hidden.vbs` | 隐藏窗口启动注入器 |
| `autostart.ps1` | 注册/移除开机自启 |
| `probe.mjs` | 探测所有 target 的 DOM 结构（只读） |
| `shot.mjs` | 通过 CDP 给指定 target 截图 |
| `list_targets.mjs` | 列出所有 target |
| `eval_all.mjs` / `click.mjs` | 在页面里执行 JS / 按文字点击按钮 |
| `hover_probe.mjs` | 用真实鼠标事件验证悬停命中 |
| `send_msg.mjs` / `batch_send.mjs` | 向聊天框发消息（造测试数据用） |
| `shoot_window.ps1` / `shoot_handle.ps1` | 用 Win32 `PrintWindow` 截任意窗口（不限于 Electron） |
| `enum_windows.ps1` / `enum_qq.ps1` | 枚举窗口句柄（排查截图/句柄问题时用） |
| `dev/` | 开发期的诊断脚本，一次性调试用，不是运行依赖 |

## 环境要求

- Windows
- CodeBuddy IDE（CN 版，基于 VS Code 1.106 / Electron 37）
- Node.js ≥ 21（用到内置 `WebSocket`；实测 v24 通过）
- PowerShell 5.1 以上（脚本用到了 `New-Object` 等旧语法，兼容 5.1）

## 已知限制

1. **依赖客户端内部结构**。CSS Modules 的哈希类名、React fiber 的 `totalCount` / `messages` / `scrollToIndex` 都是内部实现。CodeBuddy 一升级，脚本可能静默失效，需要重新适配。这是注入方案的固有代价，无法避免。
2. **调试端口是安全面**。虽然只绑 `127.0.0.1`，但本机任何程序都能连上去操控这个 IDE。用完可以用 `set_shortcut.ps1 -Restore` 关掉。
3. **预加载会滚动画面**。原理限制，见上文。
4. **只对 CodeBuddy 验证过**。理论上任何 Electron 应用都能用类似思路，但 DOM 结构完全不同，`nav_payload.js` 需要重写。
5. **单实例锁的坑**：只要还有一个 CodeBuddy 进程在，带参数启动的新进程只会把参数转发给旧实例然后退出，端口不会开。必须全部关掉。

## 免责声明

本项目通过 Chromium 自带的 DevTools 协议，在运行时向客户端界面注入 UI，**不修改、不反编译、不重新打包 CodeBuddy 任何文件**。仅在你自己的机器上、为你自己的使用体验服务。

注入的 UI 只存在于内存中，IDE 关闭后不留痕迹。

## License

MIT
