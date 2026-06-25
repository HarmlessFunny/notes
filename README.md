# Notes - 智能笔记应用

一个基于 Vue 3 + Flask 的智能笔记管理系统，支持 Markdown 渲染、数学公式、AI 复习助手等功能。

## 功能特性

- **笔记管理** - 创建、编辑、删除笔记，支持图片上传
- **Markdown 渲染** - 支持代码高亮、数学公式（KaTeX）
- **艾宾浩斯复习** - 根据遗忘曲线智能推荐复习计划
- **AI 复习助手** - 与 AI 对话复习笔记内容，自动生成练习题并批改
- **PDF 导出** - 将笔记导出为 PDF 文件
- **响应式设计** - 适配桌面端和移动端

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
- JSON 文件数据库

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/HarmlessFunny/notes.git
cd notes
```

### 2. 前端配置

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 3. 后端配置

```bash
# 安装 Python 依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API_KEY、BASE_URL 和 MODEL_NAME

# 启动后端服务
python backend/backend.py
```

### 4. 访问应用

前端开发服务器运行在 `http://localhost:5173`
后端 API 服务运行在 `http://localhost:5000`

## 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `API_KEY` | API 密钥，用于 AI 功能 | 是 |
| `BASE_URL` | API 基础 URL，用于 AI 功能，例如 'https://api.deepseek.com/' | 是 |
| `MODEL_NAME` | 模型名称，用于 AI 功能，例如 'deepseek-v4-flash' | 是 |


## 项目结构

```
notes/
├── src/                    # 前端源码
│   ├── components/         # Vue 组件
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Pinia 状态管理
│   ├── views/              # 页面视图
│   ├── router/             # 路由配置
│   └ utils/                # 工具函数
│   └ App.vue               # 根组件
│   └ main.ts               # 入口文件
├── backend.py              # Flask 主服务
├── backend_ai.py           # AI 相关功能
├── backend_tools.py        # 数据库操作
├── backend_utils.py        # 工具函数
├── assets/                 # 图片资源
├── database.json           # 数据库文件
├── requirements.txt        # Python 依赖
├── package.json            # Node.js 依赖
└ vite.config.ts            # Vite 配置
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/notes` | GET | 获取所有笔记 |
| `/api/notes/<someday>` | GET | 获取指定日期的复习笔记 |
| `/api/note/<id>` | GET | 获取单篇笔记详情 |
| `/api/submit` | POST | 创建/更新笔记 |
| `/api/notes/delete` | DELETE | 批量删除笔记 |
| `/api/ai` | POST | AI 流式对话 |
| `/api/ai/quiz` | POST | 生成练习题 |
| `/api/ai/grade` | POST | 批改练习题 |

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！