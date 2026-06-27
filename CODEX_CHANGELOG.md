# CODEX_CHANGELOG

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
