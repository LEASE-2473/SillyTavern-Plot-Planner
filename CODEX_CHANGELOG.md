# CODEX_CHANGELOG

## 2026-06-28 - 自动补全独立 API 生成端点

### 用户目标

允许用户在独立 OpenAI 兼容 API 配置中只填写到 `/v1`，避免遗漏 `/chat/completions` 导致生成草案返回 HTTP 405。

### 主要修改内容

- 新增独立 API URL 解析函数：以 `/v1` 结尾时自动补全 `/chat/completions`。
- 兼容用户填写完整 `/v1/chat/completions`，不会重复追加；误填 `/models` 时会切换为生成端点。
- API URL 输入框示例和说明改为只需填写到 `/v1`。
- 插件版本由 `2.0.9` 更新为 `2.1.0`。

### 修改的文件

- `index.js`
- `manifest.json`
- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`

### 执行的验证命令及结果

- `node --check .\plot-planner\index.js`：通过，无语法错误输出。
- `node -e "JSON.parse(...manifest.json...)"`：通过，输出 `manifest ok`。
- URL 解析单元断言：通过，确认 `/v1`、`/v1/`、完整 `/chat/completions` 与 `/models` 四种输入均解析为正确生成端点。
- `git -C .\plot-planner diff --check`：通过，仅输出现有行尾转换提示。

### 未完成事项

- 尚未在真实 SillyTavern UI 中使用独立 API 端到端生成草案。

### 已知风险与后续建议

- 自动补全只针对标准 OpenAI 兼容 `/v1` 与 `/models` 路径；其他厂商的非标准完整端点保持原样。

## 2026-06-28 - 增加手动重新拆解剧情并移除 JSON 修复请求

### 用户目标

在剧情大纲经用户确认后，如果 03 + 05 任务拆解请求因 API、空响应或格式错误而失败，允许通过独立按钮重新发送完整拆解请求；删除原 04 JSON 修复兜底，并重新排序提示词维护文件。

### 主要修改内容

- 新增“重新拆解剧情”按钮：首次拆解失败后保留当前剧情大纲、隐藏初次拆解按钮并显示重拆按钮。
- 重拆会重新执行完整任务拆解 system/user prompt 与 JSON Schema 请求，不复用或修补上一次错误响应。
- 删除 `BREAKDOWN_REPAIR_SYSTEM_PROMPT`、`repairTaskJson()` 及解析失败后的自动修复调用。
- API 状态错误不再被误判为“不支持 JSON Schema”并自动改用文本模式重发。
- 为重拆按钮增加独立配色、底部按钮换行和移动端全宽布局。
- 插件版本由 `2.0.8` 更新为 `2.0.9`。
- 提示词维护目录删除原 04，并将原 05/06 重编号为 04/05；README 同步更新为 `01/02 → 03/04 → 05`。

### 修改的文件

- `index.js`
- `style.css`
- `manifest.json`
- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`
- `../PlotPlanner-提示词拆分/README.md`
- `../PlotPlanner-提示词拆分/04-任务拆解用户提示词.md`
- `../PlotPlanner-提示词拆分/05-主聊天任务注入提示词.md`
- 删除 `../PlotPlanner-提示词拆分/04-任务JSON修复提示词.md`

### 执行的验证命令及结果

- `node --check .\plot-planner\index.js`：通过，无语法错误输出。
- `node -e "JSON.parse(require('fs').readFileSync('.\\plot-planner\\manifest.json','utf8')); console.log('manifest ok')"`：通过，输出 `manifest ok`。
- PowerShell 静态流程断言：通过，确认重拆按钮、事件绑定与完整重拆处理存在，修复常量/函数和旧 04 文件均已移除，提示词文件按 01 至 05 连续编号。

### 未完成事项

- 尚未在真实 SillyTavern UI 中端到端验证拆解失败后的按钮显示与重新请求。

### 已知风险与后续建议

- 如果模型持续返回无效 JSON，用户可能需要多次点击重拆；当前设计不会自动无限重试。
- JSON Schema 不受支持时仍会回退到 JSON 文本模式，但明确的 HTTP/API 错误会直接交由手动重拆处理。

## 2026-06-28 - 缝合 Gemini 精修提示词并接受 UI 字号调整

### 用户目标

将 Gemini 已精修的拆分提示词缝合回 `index.js`，接受用户已验证过的 `style.css` UI 字号修改，并将 `plot-planner` 插件项目推送到 GitHub；本轮只更新 `plot-planner/PROJECT_CONTEXT.md` 与 `plot-planner/CODEX_CHANGELOG.md`，不更新工作区根目录连续性文档。

### 主要修改内容

- 将插件版本从 `2.0.7` 更新到 `2.0.8`。
- 将 Gemini 精修后的任务拆解 system prompt 缝合进 `DEFAULT_BREAKDOWN_SYSTEM_PROMPT`，强化微动作拆解、防偷跑、柔性导向、盲盒原则与客观完成条件。
- 将动态任务拆解 user prompt 缝合进 `handleBreakdown()`，要求 summary 明确允许跟随 `{{user}}`、允许任务搁置，并要求 completionCriteria 避免心理状态、使用可观察微小事实。
- 将主聊天任务注入 prompt 缝合进 `updatePromptInjection()`，强化“柔性剧情导向”、跟随玩家、允许偏离、每次只走半步、不得替玩家决定、完成标签只在最末尾输出以及输出后静默。
- 按用户确认接受 `style.css` 中由 Gemini 修改并已验证的 UI 字号整理：在插件覆盖层设置统一基础字号，并让表单/按钮继承字号，减少局部重复字号声明。
- 更新 `PROJECT_CONTEXT.md` 中当前版本与开发状态。

### 修改的文件

- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`
- `index.js`
- `manifest.json`
- `style.css`

### 执行的验证命令及结果

- `node --check .\plot-planner\index.js`：通过，无语法错误输出。
- `node -e "JSON.parse(require('fs').readFileSync('.\\plot-planner\\manifest.json','utf8')); console.log('manifest ok')"`：通过，输出 `manifest ok`。

### 未完成事项

- 尚未在真实 SillyTavern UI 中端到端复测新版提示词对 Gemini 主聊天节奏的影响。

### 已知风险与后续建议

- 新提示词显著强化“跟随玩家”和“允许任务搁置”，实测时需观察是否会导致剧情推进过慢；如过慢，可在拆解 prompt 或注入 prompt 中适度增加“自然机会出现时轻推半步”的表达。
- 任务完成仍依赖主聊天 AI 正确在末尾输出 `<complete></complete>`；如果 Gemini 偶尔忘记输出，仍需要用户手动完成或跳过任务。

## 2026-06-28 - 增加上下文标签过滤与调试面板

### 用户目标

减少剧情规划上下文中的结构化标签块导致的 token 浪费；标签过滤需要放在 API / 提示词高级设置中，允许用户用横向输入手动配置黑名单标签并通过常用标签快捷按钮追加，不要求手写尖括号；同时增加调试功能查看发送给 AI 的剧情规划、任务拆分、修复请求与任务执行注入内容，并弱化主页面一次性配置区，提高剧情和任务区域可读性。任务完成后推送到个人 GitHub 仓库。

### 主要修改内容

- 新增可配置“聊天标签过滤”高级设置：启用开关、逗号分隔黑名单输入、常用标签快捷按钮和重置按钮。
- 默认黑名单包含 `draft_notes`、`npc_char_status`、`Love_Cheat_history`、`Love_Cheat`、`w2g`、`catsay`、`details`，用户可在前台直接修改。
- 过滤逻辑自动把标签名匹配为 `<标签>...</标签>`；特殊项 `!--` 匹配 HTML 注释 `<!-- ... -->`；过滤只作用于发送给剧情规划 AI 的上下文副本，不修改聊天正文，也不限制剩余正文长度。
- 世界书触发上下文和最近聊天上下文均复用同一过滤配置。
- 新增调试面板，可查看最近 LLM 请求的 system prompt、user prompt/content，以及当前任务执行注入 prompt。
- 为剧情草案生成、剧情大纲商讨、任务节点拆分、任务 JSON 修复请求添加调试标签，便于区分来源。
- 缩小剧情生成上半区字体、间距和控件尺寸；将标签过滤放入高级设置，降低一次性配置项对主页面的占用。
- 更新扩展版本到 `2.0.7`。

### 修改的文件

- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`
- `index.js`
- `manifest.json`
- `style.css`

### 执行的验证命令及结果

- `node --check index.js`：通过。
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`：通过，输出 `manifest ok`。

### 未完成事项

- 尚未在真实 SillyTavern UI 中端到端复测标签过滤输入、调试面板显示和紧凑 UI 的视觉效果。

### 已知风险与后续建议

- 标签过滤基于成对标签块匹配；如果模型输出未闭合标签，可能无法完整过滤该块。
- 调试面板记录保存在当前页面会话内，不写入聊天元数据，刷新页面后会清空。
## 2026-06-28 - 强化插件内表单颜色隔离

### 用户目标

修复 Plot Planner 在当前 SillyTavern 主题下任务链文本框不选中文本时几乎不可见的问题；不要继续依赖酒馆主题颜色，插件内字体颜色和文本框背景应统一使用插件自己的样式。

### 主要修改内容

- 在 `.plot-planner-overlay` 内定义插件专用色板变量，减少对 SillyTavern 主题变量的依赖。
- 对插件内 `input`、`textarea`、`select` 强制使用插件深色背景、浅色文字、固定边框、插入光标颜色和选区颜色。
- 为任务链 `.task-content` 文本框移除透明底假设，改为固定深色背景、边框、内边距和聚焦高亮。
- 为任务完成条件 `.task-criteria` 单独固定浅绿色文字，避免被主题覆盖。
- 更新扩展版本到 `2.0.6`。

### 修改的文件

- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`
- `manifest.json`
- `style.css`

### 执行的验证命令及结果

- `node --check index.js`：通过。
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`：通过，输出 `manifest ok`。

### 未完成事项

- 尚未在真实 SillyTavern UI 与用户当前主题下进行视觉端到端复测。

### 已知风险与后续建议

- 本次使用插件作用域内的 `!important` 来压过外部主题样式；如果后续需要支持浅色插件主题，可再抽出可配置色板。

## 2026-06-28 - 移除 LLM 自动完成判定

### 用户目标

确认“自动判定完成”会额外调用 API 模型并浪费 token 后，改为只使用 `<complete></complete>` 完成标签和手动完成按钮推进任务；同时核验手动完成按钮是否具备推进当前任务的功能性。

### 主要修改内容

- 移除执行区“自动判定完成”开关。
- 移除每条角色回复后调用 LLM 判断任务是否完成的 `judgeTaskCompletion` 路径。
- 消息监听仅检测最新角色回复中的完成标签；没有完成标签时不再发起任何完成判定请求。
- 保留“手动完成”按钮，并确认它调用 `completeCurrentTask('manual')`，会将当前任务标记完成、切换到下一任务、更新 prompt 注入并保存聊天元数据。
- 更新扩展版本到 `2.0.5`。

### 修改的文件

- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`
- `index.js`
- `manifest.json`

### 执行的验证命令及结果

- `node --check index.js`：通过。
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`：通过，输出 `manifest ok`。

### 未完成事项

- 尚未在真实 SillyTavern UI 中点击“手动完成”进行端到端验证。

### 已知风险与后续建议

- 移除 LLM 自动完成判定后，如果主聊天 AI 忘记输出 `<complete></complete>`，任务不会自动推进，需要用户点击“手动完成”或“跳过”。
## 2026-06-28 - 调整完成标签处理与剧情执行控制

### 用户目标

保留主聊天正文中的完成标签，不再删除或改写 SillyTavern 消息，避免破坏用户复杂 XML/HTML 标签渲染；强化剧情节点注入提示，约束主聊天 AI 不替 `{{user}}` 做决定、不抢话、不一次推进多个剧情节点；在剧情规划停止或用户想换任务时，提供手动清空所有剧情/任务链的入口，并确保未启用剧情推动时不注入任何内容。

### 主要修改内容

- 完成标签检测改为只读最新角色回复中的 `<complete></complete>` / `<complete>` 等信号，检测后只推进任务，不再替换 `message.mes`、不再更新 swipes、不再触发消息刷新、不再保存被清理后的聊天。
- 完成标签检测独立于“自动判定完成”开关；开关关闭时仍可用标签推进，关闭的只是额外 LLM 判定兜底。
- 将任务注入提示强化为执行边界：只推进当前节点、不得替 `{{user}}` 决策或行动、不得抢话、每次最多推进一个核心戏剧拍点、完成后不得继续下一节点。
- 任务拆解提示要求每个任务只包含一个核心戏剧拍点，并把 completionCriteria 写成最近一步可观察的小完成事实。
- 新增“清空剧情”按钮，清空当前草案、商讨记录、任务链与活动任务，并立即清除 Plot Planner prompt 注入。
- 更新扩展版本到 `2.0.4`。

### 修改的文件

- `PROJECT_CONTEXT.md`
- `CODEX_CHANGELOG.md`
- `index.js`
- `manifest.json`

### 执行的验证命令及结果

- `node --check index.js`：通过。
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`：通过，输出 `manifest ok`。

### 未完成事项

- 尚未在真实 SillyTavern UI 中端到端复测按钮显示、清空行为和完成标签推进。

### 已知风险与后续建议

- 因为完成标签会保留在聊天历史中，主模型可能在后续上下文中学到该格式；当前已通过任务注入要求只在当前节点明确完成时输出一次 `<complete></complete>`，建议实测观察是否仍需进一步改成更独特的隐藏标记。
- 如果模型在草稿、摘要或状态栏中复述 `<complete></complete>`，仍可能触发完成；当前提示已要求不要在这些区域提及完成标签，后续可按实测决定是否增加更严格的标记位置规则。
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
