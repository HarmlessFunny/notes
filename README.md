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
- **PDF 导出** - 将笔记导出为 PDF 文件
- **响应式设计** - 适配桌面端和移动端
- **单文件部署** - 后端可打包为单个 `.exe`，前端已内嵌，开箱即用

## 快速开始

### 普通用户

点击下载最新版
[**Windows-x64**](https://github.com/HarmlessFunny/notes/releases/latest/download/Notes-Windows-x64.zip)

### 开发者

#### 1. 克隆项目

```bash
git clone https://github.com/HarmlessFunny/notes.git
cd notes
```

#### 2. 前端配置

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

#### 3. 后端配置

```bash
# 安装 Python 依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API_KEY、BASE_URL 和 MODEL_NAME

# 启动后端服务
python backend/backend.py
```

#### 4. 访问应用

前端开发服务器运行在 `http://localhost:5173`
后端 API 服务运行在 `http://localhost:5000`

### 打包部署

项目支持一键打包为单个可执行文件（含前端 + 后端）：

```bash
# 运行批处理（Windows）
.\build.bat
```

打包完成后，`release/backend.exe` 即为完整应用（约 30MB）。

**部署时**，将 `backend.exe` 放到任意目录，同级放一个 `.env` 文件：

```env
API_KEY=your_api_key
BASE_URL=your_base_url
MODEL_NAME=your_model_name
# REASONING_EFFORT=high    # 可选，仅部分模型支持

FRONTEND_PORT=5173
BACKEND_PORT=5000
```

首次运行会自动创建 `database.json`、`assets/`、`notes/`。

## 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `API_KEY` | API 密钥，用于 AI 功能 | 否 |
| `BASE_URL` | API 基础 URL，用于 AI 功能，例如 'https://api.deepseek.com/' | 否 |
| `MODEL_NAME` | 模型名称，用于 AI 功能，例如 'deepseek-v4-flash' | 否 |
| `REASONING_EFFORT` | 推理努力程度（支持该参数的模型：o1/o3/deepseek-reasoner 等），留空则不传 | 否 |
| `FRONTEND_PORT` | 前端开发服务器端口（仅开发模式），默认 5173 | 否 |
| `BACKEND_PORT` | 后端服务端口，默认 5000 | 否 |

## 数据存储

采用**分离式存储**设计，轻量且清晰：

```
backend/
├── database.json          # 元信息：title / subject / time
├── notes/                 # 笔记正文（Markdown 文件）
│   ├── <title>.md            # 格式：# subject/title\n正文+图片引用
│   └── ...
├── assets/                # 上传的图片文件
│   ├── xxx.png
│   └── ...
└── dist/                  # 前端构建产物（打包后内嵌于 exe）
```

- `database.json` 只存笔记元信息（标题、科目、时间），不存正文和图片列表
- 每篇笔记正文存储在 `notes/<title>.md`，首行为 `# subject/title`，其余为正文 + 图片引用
- 图片引用格式：`![图片](../assets/文件名)`，运行时后端从 md 文件解析

## 项目结构

```
notes/
├── src/                    # 前端源码
│   ├── components/         # Vue 组件
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Pinia 状态管理
│   ├── views/              # 页面视图
│   ├── router/             # 路由配置
│   ├── types/              # TypeScript 类型定义
│   └── utils/              # 工具函数
├── backend/                # 后端源码
│   ├── backend.py          # Flask 主服务（路由）
│   ├── backend_ai.py       # AI 相关功能（对话、出题、批改）
│   ├── backend_tools.py    # 数据访问层（md 文件读写 + database.json）
│   ├── backend_utils.py    # 工具函数（装饰器、SSE 流式响应）
│   ├── notes/              # 笔记 Markdown 文件
│   ├── assets/             # 图片资源
│   ├── database.json       # 元信息数据库
│   └── dist/               # 前端构建产物
├── build.bat               # 一键构建脚本
├── requirements.txt        # Python 依赖
├── package.json            # Node.js 依赖
└── vite.config.ts          # Vite 配置
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/notes` | GET | 获取所有笔记（精简字段） |
| `/api/notes/<someday>` | GET | 获取指定日期需复习的笔记 |
| `/api/notes/search?q=` | GET | 搜索笔记（匹配标题/科目） |
| `/api/note/<title>` | GET | 获取单篇笔记详情（含正文和图片） |
| `/api/notes/batch` | POST | 批量获取笔记 |
| `/api/submit` | POST | 创建笔记 |
| `/api/note/<title>` | PUT | 更新笔记 |
| `/api/notes/delete` | DELETE | 批量删除笔记 |
| `/api/ai` | POST | AI 流式对话 |
| `/api/ai/quiz` | POST | 生成练习题 |
| `/api/ai/grade` | POST | 批改练习题 |
| `/api/ai/chat` | GET/POST/DELETE | AI 对话记录管理 |

## 技术栈

### 前端
- Vue 3 + TypeScript
- Vite
- Element Plus
- Pinia (状态管理)
- Vue Router
- Marked + KaTeX (Markdown 渲染)
- html2canvas + jsPDF (PDF 导出)

### 后端
- Python 3
- Flask
- OpenAI SDK
- JSON 文件数据库 + Markdown 文件存储

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
