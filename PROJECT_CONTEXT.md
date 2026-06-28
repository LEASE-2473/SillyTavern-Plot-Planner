# PROJECT_CONTEXT

## 项目目标与用途

Plot Planner 是一个 SillyTavern 第三方前端扩展，用于生成类似大型 RPG 主线任务的剧情规划，并拆解成可逐步注入主聊天的小任务。扩展会让主聊天 AI 推进当前任务节点，并在任务完成后进入下一阶段，直到整条剧情完成。

## 技术栈与运行环境

- SillyTavern 浏览器端第三方扩展。
- 原生 JavaScript IIFE、jQuery、CSS。
- 通过 `manifest.json` 声明 `index.js` 与 `style.css`。
- 调用 SillyTavern 前端 API：`SillyTavern.getContext()`、`generateRaw()`、`setExtensionPrompt()`、聊天事件与聊天元数据。
- 支持复用 SillyTavern 当前模型，也支持用户配置 OpenAI 兼容 API。

## 主要文件

- `manifest.json`：扩展声明、版本、脚本、样式、GitHub 地址与自动更新设置。
- `index.js`：UI、上下文构建、剧情草案生成、商讨、任务拆解、任务注入、状态持久化、完成判定与错误处理。
- `style.css`：弹窗、任务列表、错误区、上下文预览与移动端样式。
- `prompts.json`：内置系统提示词模板。
- `PROJECT_CONTEXT.md`：当前项目真实状态摘要。
- `CODEX_CHANGELOG.md`：Codex 修改记录。

## 核心模块及职责

- 剧情生成界面：默认展示常用上下文选择、剧情方向/结局、期望任务节点数量和生成草案按钮；API、Profile、提示词配置与聊天标签过滤折叠在高级设置中，以弱化一次性配置项。
- 剧情上下文构建器：按选项收集最近聊天、角色信息、作者注释、激活世界书，并展示收集摘要；最近聊天可按用户配置的黑名单标签过滤结构化标签块，只把过滤后的副本发送给剧情规划 AI。
- 剧情规划提示词：用户可通过模板/自定义保存剧情内容提示词；生成和商讨阶段会结合固定格式提示，输出规范剧情大纲。
- 草案生成与商讨：生成固定格式剧情大纲，修改时携带当前大纲和最近商讨记录，并返回完整最新版大纲。
- 子任务拆解提示词：独立于剧情规划提示词，专门用于把最终大纲转换成线性 RPG 子任务 JSON。
- 任务拆解：只发送拆解提示词与最终敲定的大纲，不再重复发送世界书、聊天记录等长上下文；每个任务包含 `title`、`summary`、`completionCriteria`。
- 任务注入：把当前任务注入 SillyTavern 主提示区，让主聊天 AI 自然推动当前节点。
- 自动推进：识别 `<complete></complete>` / `<complete>` / `<QuestComplete>` / `<plot-complete>` 标签并进入下一任务；完成标签只读取最新角色回复，不改写或清理聊天正文；不再额外调用 LLM 自动判定完成。
- 执行控制：支持手动完成、跳过、回退、暂停、停止规划和清空当前剧情/任务链；手动完成与完成标签共用同一推进逻辑。
- 请求控制：支持错误显示、重试、取消请求和请求超时；调试面板可查看最近发送给 AI 的 system/user prompt 以及当前任务执行注入。

## 运行、安装和验证方法

- 安装/测试：将本目录复制到 SillyTavern 的 `data/default-user/extensions/plot-planner`。
- 启动 SillyTavern 后，通过顶部地图图标打开剧情规划器。
- 静态语法检查：`node --check index.js`
- 清单 JSON 检查：`node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`

## 重要设计决策与约定

- 本目录是插件发布项目根目录；后续不再直接把 SillyTavern 的 extension 测试目录当作源码仓库。
- 扩展保持无构建步骤，发布文件即运行文件。
- 任务拆解优先使用 JSON Schema；若首次 JSON 无效，会自动发起一次“修复为合法 JSON”的请求，而不是在前端复杂解析自由文本。
- 当前任务使用 SillyTavern extension prompt 的 `IN_PROMPT` 位置注入。
- 主聊天 AI 完成节点时推荐输出 `<complete></complete>`；扩展只把它作为最新回复的完成信号读取并推进任务，不删除、不替换、不刷新聊天正文。

## 当前开发状态

- 当前版本：`2.0.7`。
- 已实现弱化配置区的剧情生成面板、可配置聊天标签过滤、调试提示词查看面板、插件内表单控件独立深色主题与任务文本框可读颜色、固定格式剧情草案生成、上下文收集预览、草案商讨记忆、按聊天持久化、独立子任务拆解提示词、任务拆解 JSON 修复请求、任务执行控制、清空剧情、错误/重试/取消/超时处理、不改写正文且不额外消耗判定模型的完成标签推进。
- 本目录是当前唯一项目根目录。

## 已知问题

- 尚未在真实 SillyTavern UI 中完成端到端复测。
- 不同模型对 JSON Schema 支持不一致；已加入一次 JSON 修复请求，但如果模型连续无视 JSON 要求，仍可能需要重试或手动编辑任务。
