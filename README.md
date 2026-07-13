# Notes - 智能笔记应用

**你是不是也有这样的烦恼？**

- 笔记写了一大堆，但从来不复习，等于白写。
- 想按艾宾浩斯曲线复习，但手动算日期太麻烦。

**Notes 帮你自动搞定这一切。** 写完笔记，系统自动帮你规划复习时间，到点提醒你——你只需要专注学习和创作。

## 功能特性

- **笔记管理** - 创建、编辑、删除笔记，支持图片上传
- **Markdown 存储** - 笔记正文以 `.md` 文件存储，database.json 只存元信息，清晰可读
- **Markdown 渲染** - 支持代码高亮、数学公式（KaTeX）
- **艾宾浩斯复习** - 根据遗忘曲线智能推荐复习计划
- **AI 复习助手** - 与 AI 对话复习笔记内容，自动生成练习题并批改
- **暗色模式** - 支持深浅色主题切换，自动保存偏好
- **响应式设计** - 适配桌面端和移动端
- **Windows 桌面应用** - 基于 Electron，可直接双击运行

## 快速开始

### 普通用户

点击下载最新版
[**Windows-x64**](https://github.com/HarmlessFunny/notes/releases/latest/download/Notes-Windows-x64.zip)

解压后双击 `Notes.exe` 即可运行。

### 开发者

#### 1. 克隆项目

```bash
git clone https://github.com/HarmlessFunny/notes.git
cd notes
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 启动开发服务器

```bash
npm run dev
```

前端开发服务器运行在 `http://localhost:5173`
后端 API 服务运行在 `http://localhost:3001`

AI 配置（API Key / Base URL / Model）在网页右上角 ⚙️ 设置，保存到浏览器 localStorage。

### 打包部署

```bash
.\build.bat
```

打包完成后，`release\Notes-Windows-x64\Notes.exe` 即为完整桌面应用。

首次运行会自动创建 `database.json`、`uploads/images/`、`notes/`。

## AI 配置

AI 功能（对话复习）的 API 配置在网页右上角 ⚙️ 设置：

| 配置项 | 示例 |
|--------|------|
| Base URL | `https://api.deepseek.com/` |
| 模型名 | `deepseek-v4-flash` |
| API Key |  |
| 启用识图 | `false` |

配置保存到浏览器 `localStorage`，无需环境变量。

## 数据存储

采用**分离式存储**设计，轻量且清晰：

```
├── database.json          # 元信息：title / subject / time
├── notes/                 # 笔记正文（Markdown 文件）
│   ├── <title>.md         # 格式：# subject/title\n正文+图片引用
│   └── ...
├── uploads/images/        # 上传的图片文件
│   ├── <title>.png
│   └── ...
└── server/dist/           # 前端构建产物
```

- `database.json` 只存笔记元信息（标题、科目、时间），不存正文和图片列表
- 每篇笔记正文存储在 `notes/<title>.md`，首行为 `# subject/title`，其余为正文 + 图片引用
- 图片引用格式：`![图片](../uploads/images/文件名)`，运行时后端从 md 文件解析

## 项目结构

```
notes/
├── src/                    # 前端源码（Vue 3 + TypeScript）
│   ├── components/         # Vue 组件
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Pinia 状态管理
│   ├── views/              # 页面视图
│   ├── router/             # 路由配置
│   ├── types/              # TypeScript 类型定义
│   └── utils/              # 工具函数
├── server/                 # 后端源码（Express + TypeScript）
│   ├── app.ts              # Express 应用工厂
│   ├── main.ts             # 开发模式入口
│   ├── electron.ts         # Electron 主进程
│   ├── preload.ts          # Electron preload 脚本
│   ├── routes/             # 路由定义
│   ├── services/           # 数据访问层
│   ├── middleware/         # 中间件
│   ├── ai/                 # AI 功能（对话、出题、批改）
│   └── types/              # 后端 TS 类型
├── server/dist/            # 前端构建产物
├── build.bat               # 一键构建脚本
├── package.json            # 依赖配置
├── vite.config.ts          # Vite 配置
└── electron-builder.yml    # Electron 打包配置
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/notes` | GET | 获取所有笔记（精简字段） |
| `/api/notes/:someday` | GET | 获取指定日期需复习的笔记 |
| `/api/notes/search?q=` | GET | 搜索笔记（匹配标题/科目） |
| `/api/note/:title` | GET | 获取单篇笔记详情（含正文和图片） |
| `/api/notes/batch` | POST | 批量获取笔记 |
| `/api/submit` | POST | 创建笔记 |
| `/api/note/:title` | PUT | 更新笔记 |
| `/api/notes/delete` | DELETE | 批量删除笔记 |
| `/api/export?titles=` | GET | 导出笔记为 ZIP |
| `/api/ai` | POST | AI 流式对话 |
| `/api/ai/chat` | GET/POST/DELETE | AI 对话记录管理 |

## 技术栈

### 前端
- Vue 3 + TypeScript + Vite
- Element Plus
- Pinia（状态管理）
- Vue Router
- Marked + KaTeX（Markdown 渲染）

### 后端
- Node.js + TypeScript
- Express
- Electron（桌面壳）
- OpenAI SDK
- JSON 文件数据库 + Markdown 文件存储

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
