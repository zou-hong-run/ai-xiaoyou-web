# AI小左网页版智能对话机器人（数字人，虚拟人）

## 项目概述
一个基于WebSocket的智能语音助手系统，集成语音识别(IAT)、语音合成(TTS)和AI对话(Spark API)功能，支持自定义功能扩展。

## 功能特性
- 🎙️ 实时语音识别（ASR）
- 🔊 高质量语音合成（TTS）
- 对话中断
- 支持FunctionCall功能调用
- 💡 多轮AI对话（Spark API）
- 🔌 可扩展功能插件系统
- 📱 响应式Web界面

## 快速开始

### 环境要求
- Node.js 16+
- 现代浏览器(Chrome/Firefox/Edge)
- HTTPS环境(部分API需要)

### 安装步骤
```bash
# 克隆仓库
git clone https://github.com/zou-hong-run/ai-xiaoyou-web.git

# 安装依赖
pnpm install

# 配置环境变量
cp .env
# 编辑.env文件填写您的API密钥

# 启动项目
pnpm run dev
