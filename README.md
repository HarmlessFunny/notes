# Notes - 智能笔记应用

**你是不是也有这样的烦恼？**

- 笔记写了一大堆，但从来不复习，等于白写。
- 想按艾宾浩斯曲线复习，但手动算日期太麻烦。

**Notes 帮你自动搞定这一切。** 写完笔记，系统自动帮你规划复习时间，到点提醒你——你只需要专注学习和创作。

## 功能特性

- **笔记管理** — 创建、编辑、删除笔记，支持图片上传
- **Markdown 存储** — 笔记正文以 `.md` 文件存储，database.json 只存元信息，清晰可读
- **Markdown 渲染** — 支持代码高亮、数学公式（KaTeX）
- **艾宾浩斯复习** — 根据遗忘曲线智能推荐复习计划
- **AI 复习助手** — 与 AI 对话复习笔记内容，自动生成练习题并批改
- **暗色模式** — 支持深浅色主题切换，自动保存偏好
- **ZIP 导出** — 将笔记导出为 ZIP（含图片）
- **响应式设计** — 适配桌面端和移动端

## 下载

[**Windows-x64**](https://github.com/HarmlessFunny/notes/releases/latest/download/Notes-Windows-x64.exe)

[**Android-arm64-v8a**](https://github.com/HarmlessFunny/notes/releases/latest/download/Notes-Android-arm64-v8a.apk)

## 开发者

### 环境要求

- Node.js 22+
- Rust toolchain
- Android SDK + NDK（构建 APK 时需要）

### 启动开发服务器

```bash
# 安装依赖
npm install

# 启动 Tauri 开发模式（自动启动 Vite :5173 + Axum :5000）
npm run tauri dev
```

### 构建

```bash
# 一键构建 Windows exe + Android APK
.\build.bat

# 或单独构建
npx tauri build           # Windows exe
npx tauri android build --target aarch64  # Android APK
```

产物输出到 `release/`：
- `Notes-Windows-x64.exe`
- `Notes-Android-arm64-v8a.apk`

### AI 配置

AI 功能（对话复习）的 API 配置在网页右上角 ⚙️ 设置：

| 配置项 | 示例 |
|--------|------|
| Base URL | `https://api.deepseek.com/v4` |
| 模型名 | `deepseek-v4-flash` |
| API Key | |
| 启用识图 | `false` |

配置保存到浏览器 `localStorage`，无需环境变量。

## 数据存储

采用**分离式存储**设计，轻量且清晰：

```
data/
├── database.json          # 元信息：title / subject / time
├── notes/                 # 笔记正文（Markdown 文件）
│   ├── <title>.md
│   └── ...
└── uploads/images/        # 上传的图片文件
    ├── xxx.png
    └── ...
```

- `database.json` 只存笔记元信息（标题、科目、时间）
- 每篇笔记正文存储在 `notes/<title>.md`，首行为 `# subject/title`
- 运行后自动创建，无需手动初始化

## 项目结构

```
notes/
├── src/                    # Vue 3 前端
│   ├── components/
│   ├── hooks/
│   ├── stores/
│   ├── views/
│   ├── router/
│   └── utils/
├── src-tauri/              # Rust 后端 (Tauri 2 + Axum)
│   ├── src/
│   │   ├── config.rs         # 数据路径、复习间隔配置
│   │   ├── db.rs             # 数据层（JSON 数据库 + 缓存）
│   │   ├── models.rs         # 数据结构定义
│   │   ├── notes_file.rs     # 笔记文件读写
│   │   ├── routes_notes.rs   # 笔记 CRUD API
│   │   ├── routes_ai.rs      # AI 对话/出题/批改 API
│   │   ├── routes_export.rs  # ZIP 导出 API
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
| `/api/notes/search?q=` | GET | 搜索笔记 |
| `/api/note/<title>` | GET | 获取单篇笔记详情 |
| `/api/submit` | POST | 创建笔记 |
| `/api/note/<title>` | PUT | 更新笔记 |
| `/api/notes/delete` | DELETE | 批量删除笔记 |
| `/api/ai` | POST | AI 流式对话 |
| `/api/ai/chat` | GET/POST/DELETE | AI 对话记录管理 |
| `/api/ai/upload` | POST | 上传 AI 识图图片 |
| `/api/export` | GET | 导出笔记为 ZIP |
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
