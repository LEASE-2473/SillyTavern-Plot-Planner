# CODEX_CHANGELOG

## 2026-06-28 - 优化剧情生成入口与主题输入框颜色

### 用户目标

根据 `PROJECT_CONTEXT.md` 与 `CODEX_CHANGELOG.md` 理解项目后，调整 Plot Planner 的界面：不要把“剧情方向/结局”等剧情生成参数折叠在 API 配置里；同时检查 UI 与字体颜色，修复在部分 SillyTavern 主题下浅色/白色输入框中文字不可见的问题。

### 主要修改内容

- 将剧情生成参数区移出高级设置折叠面板，作为默认可见的“剧情生成”卡片展示。
- 高级设置折叠面板改为只承载 Profile、API 与提示词配置，并调整标题为“API / 提示词高级设置”。
- 为插件作用域内的 `input`、`textarea`、`select`、聊天输入框和上下文消息数输入框统一设置深色背景、浅色文字、灰色占位符与聚焦边框，降低被酒馆主题样式污染导致文字不可见的风险。
- 更新扩展版本到 `2.0.3`。

### 修改的文件

- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`
- `index.js`
- `manifest.json`
- `style.css`

### 执行的验证命令及结果

- `node --check index.js`：通过。
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`：通过。

### 未完成事项

- 尚未在真实 SillyTavern UI 与用户当前主题下进行视觉端到端复测。

### 已知风险与后续建议

- 如果某些 SillyTavern 主题使用更高优先级的 `!important` 样式覆盖插件输入框，仍可能需要追加更强的插件作用域选择器。
- 建议在当前主题下重载扩展后重点检查：剧情方向输入框、聊天修改输入框、API/Profile 选择框和任务编辑文本区域的可读性。

## 2026-06-28 - 重构剧情规划与子任务拆解提示词

### 用户目标

确认当前项目根目录为 `D:\LEASE AI Project\酒馆插件创作\plot-planner`，不再直接修改 SillyTavern extension 测试目录。将提示词拆成两套：一套用于剧情规划，包含用户可自定义保存的剧情内容提示词与固定格式提示；另一套用于专门把最终剧情大纲拆解成子任务 JSON。拆解阶段只发送拆解提示词和最终敲定的剧情内容，不再重复发送世界书等长上下文，以节省 token。

### 主要修改内容

- 新增固定剧情大纲格式提示，生成草案和商讨修改都要求返回完整、规范的大纲格式。
- 保留用户可自定义并保存的剧情规划提示词，用于控制剧情内容、风格和取向。
- 新增独立“子任务拆解提示词”配置，并随 Profile 保存/加载。
- 拆解请求改为只发送“拆解提示词 + 最终敲定剧情大纲 + 期望任务数量”，不再携带世界书、聊天记录、角色信息等长上下文。
- 简化任务解析逻辑：只接受合法 `{ "tasks": [...] }` JSON；首次解析失败时自动发起一次 JSON 修复请求。
- 将自动完成判定请求改为内部固定系统提示词，避免被用户剧情规划提示词影响。
- 更新扩展版本到 `2.0.2`。

### 修改的文件

- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`
- `index.js`
- `manifest.json`

### 执行的验证命令及结果

- `node --check index.js`：通过。
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`：通过。

### 未完成事项

- 尚未在正在运行的 SillyTavern UI 中进行完整端到端验证。

### 已知风险与后续建议

- 如果模型连续无视 JSON 要求，自动修复请求仍可能失败；届时需要重试或手动编辑任务。
- 建议下一轮实测重点检查：固定格式大纲是否稳定、拆解是否只消耗最终大纲、`<complete>` 是否能推进下一任务。

## 2026-06-28 - 修复 Plot Planner 子任务拆解与任务推进

### 用户目标

重新理解 Plot Planner 项目，让插件先生成类似大型 RPG 主线任务的剧情规划，再拆成明确小任务注入 SillyTavern 主聊天；主聊天 AI 记录任务进度，完成后返回类似 `<complete>` 的标签，扩展读取后发送下一阶段任务直到剧情完成。将当前测试用 extension 目录完全覆盖同步到 `D:\LEASE AI Project\酒馆插件创作\plot-planner`，并发布到个人 GitHub 仓库。

### 主要修改内容

- 强化任务拆解提示词，要求模型输出线性 RPG 子任务链，并明确每个任务的目标、冲突/阻碍、互动行动、边界与可观察完成条件。
- 保留 JSON Schema 结构化输出，同时增加 JSON 对象、JSON 数组、Markdown/Step 文本任务列表的兜底解析，降低“模型没有返回有效任务”的失败率。
- 将任务注入位置从 `IN_CHAT` 改为 `IN_PROMPT`，使当前剧情任务进入主提示区。
- 在任务注入中要求主聊天 AI 仅推进当前节点，完成时在末尾输出 `<complete>`。
- 新增 `<complete>` / `<QuestComplete>` / `<plot-complete>` 标签识别：检测到后清理标签、保存聊天并自动推进到下一任务。
- 更新扩展版本到 `2.0.1`。
- 清空发布项目目录中的旧文件，并用当前 SillyTavern extension 测试目录中的运行文件完全覆盖同步。

### 修改的文件

- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`
- `index.js`
- `manifest.json`
- `prompts.json`
- `style.css`

### 执行的验证命令及结果

- `node --check index.js`：通过。
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`：通过。

### 未完成事项

- 尚未在正在运行的 SillyTavern UI 中进行完整端到端验证。

### 已知风险与后续建议

- 如果模型完全无视 JSON 与 Step 任务格式，仍可能需要点击重试或手动编辑任务。
- 建议在 SillyTavern 中实际测试一次“生成草案 → 拆解任务 → 启动剧情 → 主聊天输出 `<complete>` → 自动进入下一任务”的完整链路。
