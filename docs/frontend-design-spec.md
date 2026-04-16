# LLM-Wiki 前端设计规范 (Frontend Design Spec)

本文档基于当前已实现的前端界面，总结了本项目的 UI/UX 核心设计理念、视觉风格以及页面架构规则。

## 1. 核心设计理念 (Core Philosophy)

*   **克制与聚焦 (Restraint & Focus)**：隐藏系统复杂性。例如，后台配置剥离繁琐的环境变量管理，只保留直观的输入项（Provider, API Key, Model）。
*   **全局智能化 (Ubiquitous AI)**：AI 不仅是一个独立功能，更是贯穿始终的伙伴。AI 聊天入口（悬浮窗）在所有页面全局常驻。
*   **呼吸感与现代感 (Airy & Modern)**：大量采用“新海诚式 (Shinkai)”的纯净天空背景、玻璃拟态 (Glassmorphism) 以及柔和的投影，打造具有沉浸感的内容阅读体验。

## 2. 视觉语言 (Visual Language)

### 2.1 颜色系统 (Color Palette)
*   **主色调 (Primary)**：`#66CCFF` (明亮的晴空蓝) - 用于核心按钮、重要图标、高亮强调以及全局 AI 助手。
*   **背景色 (Backgrounds)**：
    *   页面底色：`#FFFFFF` 到 `#F0F8FF` 的微弱线性渐变。
    *   玻璃面板：`bg-white/70` 到 `bg-white/90` 配合 `backdrop-blur-md` (或 `xl`)。
*   **文本颜色 (Typography)**：
    *   主标题/强强调：`#1C2833` (深邃藏青色)。
    *   次要文本/正文：`#5D6D7E` (柔和蓝灰色)。
    *   弱化文本：`gray-400`。
*   **辅助色 (Accents)**：
    *   主题 (Topics)：`#9B51E0`
    *   实体 (Entities)：`#FFB7C5`
    *   查询 (Queries)：`#4DB8FF`
    *   来源 (Sources)：`#5D6D7E`

### 2.2 阴影与特效 (Shadows & Effects)
*   **标准投影 (Card Shadow)**：`shadow-[0_4px_20px_rgba(102,204,255,0.08)]`。
*   **悬停高亮 (Hover Lift)**：元素上移 (`-translate-y-1`) 并加深阴影至 `shadow-[0_8px_30px_rgba(102,204,255,0.15)]`。
*   **磨砂玻璃 (Glassmorphism)**：使用 `backdrop-blur-md` 配合半透明白色边框 (`border-white/50` 或 `border-gray-100`)。

### 2.3 排版 (Typography)
*   **字号层级**：
    *   Hero 主标题：`text-5xl md:text-6xl font-extrabold tracking-tight`
    *   页面/区块标题：`text-3xl md:text-4xl font-bold`
    *   正文：`text-sm` 或 `text-base`，行高 `leading-7`。
*   **微排版**：标签 (Tag) 或前置说明 (Eyebrow) 使用极小字号 `text-xs`，配合大写 `uppercase` 和宽字间距 `tracking-[0.22em]` 或 `tracking-widest`。

## 3. 页面架构规则 (Page Architecture)

### 3.1 导航落地页 (Discovery - `/app`)
*   **定位**：纯粹的系统入口与最新动态展示。
*   **结构**：
    *   **Hero 区块**：强视觉冲击力，居中大卡片配合 SkyBackground 渐变。
    *   **最新动态树**：底部展示最近更新的 3 篇文章，采用垂直中轴线的“左右交错树状结构 (Staggered Tree)”进行时间线排布。
*   **限制**：不展示冗长的分类列表，引导用户点击“查看全部文章”进入知识库。

### 3.2 知识库页面 (Knowledge Base - `/app/kb`)
*   **定位**：结构化、全量的高效检索中心。
*   **结构**：
    *   **左侧层序导航**：利用侧边栏按“资源种类 (Topics, Entities, Queries, Sources)”进行过滤，附带数量角标。
    *   **主体列表**：网格布局的卡片 (DiscoveryStoryCard) 展示文章。
    *   **全局搜索**：屏幕中下部悬浮的玻璃拟态搜索栏 (`fixed bottom-10`)，随打随搜。

### 3.3 后台管理页 (Console - `/app/console`)
*   **定位**：极简的底层大脑配置。
*   **结构**：
    *   **剥离环境变量**：对普通用户完全隐藏 `.env` 的编辑概念。
    *   **输入直达**：仅保留“Provider”、“Model”以及一个纯粹的“API 密钥”密码框。
    *   **静默映射**：用户填写的 API Key 后台自动且唯一映射至 `RUNTIME_API_KEY`，确立 “所填即所得” 的最简交互。

### 3.4 全局组件 (Global Components)
*   **AI 悬浮窗 (FloatingAssistantButton)**：
    *   位置：`fixed bottom-8 right-8`。
    *   功能：作为 AI Chat 聊天的唯一/主要常驻入口，保障系统工具属性随时可用。
*   **状态卡片 (Status Cards)**：加载或错误状态使用居中的柔和卡片展示，不破坏页面整体的 Glassmorphism 结构。
