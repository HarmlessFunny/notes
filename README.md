# Notes - 智能笔记应用

**你是不是也有这样的烦恼？**

- 笔记写了一大堆，但从来不复习，等于白写。
- 想按艾宾浩斯曲线复习，但手动算日期太麻烦。

**Notes 帮你自动搞定这一切。** 写完笔记，系统自动帮你规划复习时间——你只需要专注学习和创作。

## 功能特性

- **笔记管理** — 创建、编辑、删除笔记，支持图片上传
- **Markdown 存储** — 笔记正文以 `.md` 文件存储，database.json 只存元信息，清晰可读
- **Markdown 渲染** — 支持代码高亮、数学公式（KaTeX）
- **艾宾浩斯复习** — 根据遗忘曲线智能推荐复习计划
- **AI 复习助手** — 与 AI 对话复习笔记内容，AI 可调用工具读取、搜索、增删改笔记；支持思考模式与强度；支持多会话管理（新建/切换/重命名/删除，自动记忆上次会话）
- **暗色模式** — 支持深浅色主题切换，自动保存偏好
- **ZIP 导出** — 将笔记导出为 ZIP（含图片）：桌面端弹保存对话框，手机端调起系统分享面板
- **ZIP 导入** — 将导出的 ZIP 一键恢复为笔记
- **自动检查更新** — 启动时静默检查 GitHub 最新 Release，设置页也可手动检查并跳转下载
- **多语言界面** — 内置中文 / English，设置页即时切换并自动记住偏好
- **响应式设计** — 适配桌面端和移动端

## 下载

[**Windows-x64**](https://github.com/HarmlessFunny/notes/releases/latest/download/Notes-Windows-x64.exe) [**国内镜像**](https://gh-proxy.org/https://github.com/HarmlessFunny/notes/releases/latest/download/Notes-Windows-x64.exe)

[**Android-arm64-v8a**](https://github.com/HarmlessFunny/notes/releases/latest/download/Notes-Android-arm64-v8a.apk) [**国内镜像**](https://gh-proxy.org/https://github.com/HarmlessFunny/notes/releases/latest/download/Notes-Android-arm64-v8a.apk)

## 开发者

### 环境要求

- Node.js 22+
- Rust toolchain + `aarch64-linux-android` target（Android 交叉编译）
- Java 17（Android 构建需要，`keytool` 用于生成签名密钥）
- Android SDK + NDK（构建 APK 时需要）
  - 通过 Android Studio 安装，或 CI 中由 `android-actions/setup-android` 自动配置

### 启动开发服务器

```bash
# 安装依赖
npm install

# 启动 Tauri 开发模式（自动启动 Vite :5173 + Axum :5000）
npm run tauri dev
```

### 构建

产物输出到 `release/`：
- `Notes-Windows-x64.exe`
- `Notes-Android-arm64-v8a.apk`

#### 一键构建（推荐）

```bash
.\build.bat
```

自动构建前端 → Windows exe → Android APK。首次构建自动生成签名密钥 `src-tauri\keystore.jks`（已存在则复用），保证每次构建签名一致，手机可无缝覆盖安装升级。

#### 单独构建

```bash
# Windows exe
npx tauri build

# Android APK（需先设置签名环境变量）
set TAURI_ANDROID_KEYSTORE_PATH=%CD%\src-tauri\keystore.jks
set TAURI_ANDROID_KEYSTORE_PASSWORD=notes123
set TAURI_ANDROID_KEY_ALIAS=notes
set TAURI_ANDROID_KEY_PASSWORD=notes123
npx tauri android build --target aarch64
```

首次构建 APK 需要先生成签名密钥：

```bash
keytool -genkey -v -keystore src-tauri\keystore.jks -alias notes -keyalg RSA -keysize 2048 -validity 10000 -storepass notes123 -keypass notes123 -dname "CN=Notes, OU=Dev, O=Notes, L=City, ST=State, C=CN"
```

> CI 环境自动完成以上所有步骤，无需手动配置。GitHub Actions 会从仓库 Secret `ANDROID_KEYSTORE_BASE64` 恢复签名密钥，确保每个 Release 版本签名一致。

### AI 配置

AI 功能（对话复习）的 API 配置在网页右上角 ⚙️ 设置：

| 配置项 | 示例 |
|--------|------|
| Base URL | `https://api.deepseek.com/` |
| 模型名 | `deepseek-v4-flash` |
| API Key | |
| 启用识图 | `false` |
| 思考模式 | `默认` / `禁用` / `low` / `medium` / `high` / `xhigh` / `max` |
| 显示思考 | `true` |
| 系统提示词 | 留空使用默认提示词（跟随界面语言）；占位符`{timestamp}`为当前毫秒级时间戳 |

配置保存到浏览器 `localStorage`，无需环境变量。

## 国际化 (i18n)

界面支持中文 / English 切换，设置页即时生效，偏好持久化保存。

- **文案定义** — `src/locales/zh-CN.ts` 与 `en-US.ts`（en 以 zh 结构推导类型）；组件内通过 `useI18n()` / `$t()` 取 key
- **语言传递** — 前端对本地 API 请求自动携带 `X-Lang: zh|en` 请求头；后端 `i18n.rs` 的 `Lang` 提取器读取该头，本地化所有接口错误消息（含磁盘 I/O 异常）
- **添加新语言** — 在 `src/locales/` 新建 `<code>.ts` 并按 `zh-CN.ts` 结构翻译，到 `index.ts` 注册（locale 值、语言显示名、Element Plus 组件文案）；后端文案为内联 `i18n::text(lang, zh, en)` 双语对，新增语言需同步补充
- **AI 层保持中文** — AI 工具定义/摘要、默认系统提示词及 AI 读写笔记的内部消息固定中文：复习内容面向中文用户，不随界面语言切换

## 数据存储

采用**分离式存储**设计，轻量且清晰：

```
data/
├── database.json          # 笔记元信息（title/subject/time）
├── ai_sessions/           # AI 聊天会话
│   ├── index.json         # 会话元信息（id/title/created_at/updated_at）
│   ├── <session_id>.json  # 每个会话的聊天记录（含思维链、工具调用）
│   └── ...
├── notes/                 # 笔记正文（Markdown 文件）
│   ├── <title>.md
│   └── ...
└── uploads/images/        # 上传的图片文件
    ├── xxx.png
    └── ...
```

- `database.json` 只存笔记元信息（标题、科目、时间）
- 每篇笔记正文存储在 `notes/<title>.md`，首行为 `# subject/title`
- AI 聊天按会话拆分存储于 `ai_sessions/`，旧版 `ai_chat.json` 首次启动自动迁移为第一个会话
- 运行后自动创建，无需手动初始化

## 项目结构

```
notes/
├── src/                    # Vue 3 前端
│   ├── components/
│   ├── hooks/
│   ├── locales/               # 国际化文案（zh-CN.ts / en-US.ts / index.ts）
│   ├── stores/
│   ├── views/
│   ├── router/
│   └── utils/
├── src-tauri/              # Rust 后端 (Tauri 2 + Axum)
│   ├── src/
│   │   ├── config.rs         # 数据路径、复习间隔配置
│   │   ├── db.rs             # 数据层（JSON 数据库 + 缓存）
│   │   ├── models.rs         # 数据结构定义
│   │   ├── i18n.rs           # 语言提取器（X-Lang 头）
│   │   ├── notes_file.rs     # 笔记文件读写
│   │   ├── routes_notes.rs   # 笔记 CRUD API
│   │   ├── routes_ai.rs      # AI 对话/识图上传 API
│   │   ├── routes_export.rs  # ZIP 导出 API
│   │   ├── routes_import.rs  # ZIP 导入 API
│   │   ├── export.rs         # ZIP 构建（导出/导入共用）
│   │   ├── routes_serve.rs   # 静态文件/图片服务
│   │   ├── ai_stream.rs      # AI 流式响应
│   │   ├── ai_tools.rs       # AI 工具调用
│   │   └── lib.rs            # 入口：Axum 路由 + Tauri 启动
│   └── Cargo.toml
├── data/                   # 运行时数据（自动创建）
├── build.bat               # 一键构建脚本
├── package.json
└── vite.config.ts
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/notes` | GET | 获取所有笔记（精简字段） |
| `/api/notes/<someday>` | GET | 获取指定日期需复习的笔记 |
| `/api/notes/search` | GET | 搜索笔记 |
| `/api/note/<title>` | GET | 获取单篇笔记详情 |
| `/api/submit` | POST | 创建笔记 |
| `/api/note/<title>` | PUT | 更新笔记 |
| `/api/notes/delete` | DELETE | 批量删除笔记 |
| `/api/ai/status` | GET | AI 配置状态 |
| `/api/ai` | POST | AI 流式对话 |
| `/api/ai/sessions` | GET/POST | AI 会话列表 / 新建会话 |
| `/api/ai/sessions/<id>` | GET/POST/PUT/DELETE | 会话消息读取/保存、重命名、删除 |
| `/api/ai/upload` | POST | 上传 AI 识图图片 |
| `/api/export` | GET | 导出笔记为 ZIP（桌面保存/手机分享） |
| `/api/import` | POST | 导入 ZIP 笔记 |
| `/uploads/images/<file>` | GET | 获取上传的图片 |

## 技术栈

### 前端
- Vue 3 + TypeScript + Vite
- Element Plus
- Pinia + Vue Router
- Marked + KaTeX (Markdown 渲染)

### 后端
- Rust + Tauri 2
- Axum (HTTP 框架)
- Tokio (异步运行时)
- tower-http (CORS、静态文件)
- reqwest + rustls (AI API 客户端)
- serde + serde_json
- zip (压缩导出)

### 移动端
- Android (arm64-v8a)
- Tauri 2 Android Runtime

## 许可证

MIT License
