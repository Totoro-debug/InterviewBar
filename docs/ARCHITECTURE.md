# 架构与数据边界

InterviewBar Windows 是对 [InterviewBar_MacOS](https://github.com/byp411426/InterviewBar_MacOS) `v0.10.2`（`638f4d8110f49c4bd602dab0ca73135483b3f104`）的 Windows 重写修改版。它保留核心领域语义，但以 Electron 主进程、受限 preload 桥接和 React 渲染层替代 AppKit/SwiftUI。

## 技术栈

- Electron 44：窗口、托盘、通知、系统对话框、登录自启、安全存储和 IPC。
- React 19 + TypeScript 7 + Vite 8：渲染层与构建。
- Recharts：周统计柱状图与累计折线图。
- Lucide React：界面图标。
- Vitest：领域层测试。
- electron-builder：Windows x64 NSIS 与便携版打包。

## 运行时分层

```text
React components
    | 只使用 AppData 与受限 window.interviewBar API
    v
src/app + src/domain
    | AppData 快照 / 纯验证、解析、统计、CSV 函数
    v
electron/preload.ts (contextBridge 白名单)
    | IPC
    v
electron/main.ts
    |-- AppDataStore ---------- app-data.json / backup
    |-- CredentialStore ------- safeStorage / credentials.json
    |-- AIService ------------- 用户配置的 HTTPS 模型端点
    |-- NotificationScheduler - Windows 通知
    `-- Tray / Dialog / Shell / Login item
```

### 渲染层

`src/App.tsx` 组合今日面板、日程、投递工作台、秋招之旅、设置和编辑对话框。`src/app/useAppData.ts` 在 Electron 中通过桥接加载/保存完整 `AppData` 快照，并以短延迟合并连续界面更新；浏览器预览则回退到 `localStorage`。

`src/domain/` 不依赖 Electron 或 React：

- `types.ts`：持久化数据契约；
- `events.ts`：事件验证、上海时区转换、筛选、下一项和显示语义；
- `mailParser.ts`：确定性的本机邮件规则；
- `stats.ts`：周分组、零填充和累计统计；
- `csv.ts`：CSV/TSV 状态机解析、表格校验、公式防护和导出。

### preload 桥接

`electron/preload.ts` 通过 `contextBridge` 暴露固定的 `window.interviewBar` 方法。渲染层没有 Node.js 文件系统或进程权限，只能请求以下能力：

- 窗口最小化、最大化、隐藏和退出；
- 加载/保存 `AppData`；
- 导入表格、导出 CSV；
- 打开外部 URL、数据目录和设置登录自启；
- 主动读取剪贴板；
- 重新调度通知；
- 检查/保存模型凭据和执行 AI 识别；
- 接收托盘导航事件。

### Electron 主进程

主窗口启用 `contextIsolation`、sandbox 和 `webSecurity`，关闭 `nodeIntegration`。外部导航、新窗口、webview、网页权限和应用内下载默认拒绝；打包模式设置限制性 CSP。每个 IPC handler 会校验消息来自主窗口主 frame。

AI HTTPS 请求只在主进程发起；渲染层可以提交用户当前输入的新密钥，但不能从凭据存储读回已保存的明文。外部链接必须是带主机名且不含内嵌账号密码的 HTTP/HTTPS URL；模型 API 进一步限制为无查询和片段的 HTTPS URL。

## 持久化模型

业务数据目录为 `%LOCALAPPDATA%\InterviewBar`，主文件 `app-data.json` 的当前版本号为 `1`。顶层结构包括：

```text
AppData
|-- events[]             日程
|-- applications[]       投递状态记录
|-- applicationSheet     导入的表格快照或 null
|-- importHistory[]      邮件摘要与导入时间
|-- aiUsage[]            AI 调用元数据，最多 10,000 条
`-- settings             主题、自启、通知、表格 URL、AI 非密钥配置
```

保存操作串行执行。写入新数据前，当前主文件会替换 `app-data.json.backup`；新主文件通过同目录独占临时文件、刷新和重命名完成。单个数据文件上限 50 MB。读取失败时会尝试备份，但不会覆盖损坏文件。

凭据另存为版本化的 `credentials.json`。键名是规范化模型端点的 SHA-256，值是 Electron `safeStorage` 产生的 Base64 密文。

## 事件不变量

`InterviewEvent` 使用四种 `timing`：

| timing | 日期 | 时刻 | 可提醒/统计 |
| --- | --- | --- | --- |
| `exact` | 必须是有效 `YYYY-MM-DD` | 必须是有效 `HH:mm` | 可以 |
| `dateOnly` | 必须存在 | 必须为空 | 不可以 |
| `windowStart` | 必须存在 | 必须为空 | 不可以 |
| `unknown` | 必须为空 | 必须为空 | 不可以 |

日期和时刻作为北京时间墙上时间保存，转换绝对时刻时显式使用 UTC+8。该模型避免宿主 Windows 时区把未知时刻变成午夜，或在序列化时造成日期偏移。

其他验证包括：公司非空、事件类型和状态属于固定集合、提醒值属于允许集合、链接仅为 HTTP/HTTPS、创建与更新时间可解析。过期只是一种派生显示状态，不改写持久化状态。

## 关键数据流

### 手动编辑

1. 编辑器创建或复制 `InterviewEvent` 草稿。
2. 领域层规范化并验证完整度、日期、时刻、链接和提醒。
3. `AppData` 快照在 React 状态中更新。
4. `useAppData` 保存整个快照；主进程校验大小和结构后原子写入。
5. 保存完成事件触发托盘提示更新和通知重新调度。

### 邮件导入

1. 用户主动粘贴/读取正文。
2. 本机规则直接解析，或 AIService 将正文发往自配 HTTPS 服务。
3. 识别结果在界面中校对；未知日期/时刻保持为空。
4. 保存前检查正文摘要是否重复，并校验选择的日程/投递目标属于相同公司。
5. 日程、投递记录和导入摘要被合并为一个 `AppData` 快照，一次保存。

原始正文不进入持久化模型。AI 用量由主进程记录；渲染层按记录 ID 去重后展示。

### 通知

保存、启动和系统恢复后会重新扫描数据。调度器只接受未来、待进行、`exact` 且提醒大于零的日程，按提醒时刻排序并截取前 60 条。长于 JavaScript 单次计时器上限的等待会分段重新设定。点击通知会唤起主窗口；对应记录的定位行为仍需 Windows 真机验收。

### 表格

主进程文件对话框限制单个 CSV/TSV 为 20 MB，并严格解码 UTF-8、UTF-16LE 或 UTF-16BE。领域解析器处理带引号字段、转义引号、嵌入换行和 CSV/TSV 自动判断，拒绝空/重复表头、超宽行及缺少公司列的表格。

导出由领域层生成带公式防护的 CSV，再由主进程限制到 50 MB、规范化文件名并原子写入用户选择的位置。

## 浏览器预览与桌面运行的差异

Vite 浏览器预览用于检查 React 界面，不是桌面产品替代品。没有 `window.interviewBar` 时：

- 业务数据使用浏览器 `localStorage`；
- 表格导入/CSV 导出使用浏览器文件 API；
- 不具备托盘、原生通知、登录自启、数据目录或 Windows `safeStorage`；
- AI 凭据与请求桥接不可用，只能使用本机规则。

因此涉及隐私、文件写入、通知和凭据的验收必须在 Electron 中完成。

## 构建与验证

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run dist
```

`npm run build` 的产物是网页资源 `dist/` 和主进程代码 `dist-electron/`；`npm run dist` 再输出 `release/` 安装包。生产窗口只加载打包资源，开发服务器地址仅允许本机 HTTP 主机。

领域测试当前覆盖日期/时间不变量、上海时区转换、下一项与筛选、邮件规则、周统计、累计统计、CSV/TSV 引号与换行、异常行和公式防护。托盘、Windows 通知、安装、自启、safeStorage、休眠恢复和 SmartScreen 仍需要 Windows 真机验收。

## 明确不在当前范围

- 浏览器扩展和 Native Messaging Host；
- Windows Widget 或桌面悬浮组件；
- 邮箱登录、IMAP 监控、全邮箱抓取和 OCR；
- 飞书 API、双向同步或应用内网页登录；
- 云账户、遥测、跨设备同步和自动更新；
- Windows ARM64/32 位发行包与代码签名。
