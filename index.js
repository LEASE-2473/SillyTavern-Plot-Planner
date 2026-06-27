// ========================================================================
// 剧情规划器 (Plot Planner) v2.0.5
// SillyTavern 第三方扩展 - RPG任务流式剧情管理 (含破限与多配置)
// ========================================================================
(function () {
    'use strict';

    // ===== 防重复加载 =====
    if (window.PlotPlannerLoaded) {
        console.warn('⚠️ 剧情规划器已加载，跳过重复初始化');
        return;
    }
    window.PlotPlannerLoaded = true;

    console.log('🗺️ 剧情规划器 v2.0.5 启动');

    // ===== 内部状态 =====
    let isModalOpen = false;
    let currentTasks = [];
    let activeTaskIndex = -1;
    let miniChatHistory = [];
    let currentDraft = '';
    let isExecutionPaused = false;
    let activeRequest = null;
    let lastFailedAction = null;
    
    // 多配置与预设
    let apiProfiles = [];
    let currentProfileId = 'default';
    let builtInPrompts = [];
    let customPrompts = [];

    const STATE_KEY = 'plot_planner_state';
    const REQUEST_TIMEOUT_MS = 90000;
    const EXTENSION_PROMPT_TYPES = {
        NONE: -1,
        IN_PROMPT: 0,
        IN_CHAT: 1
    };
    const COMPLETION_TAG_REGEX = /<\s*(?:complete|questcomplete|plot[-_\s]?complete)\s*(?:\/>|>\s*<\/\s*(?:complete|questcomplete|plot[-_\s]?complete)\s*>|>)/i;
    const DEFAULT_PLANNING_SYSTEM_PROMPT = '你是一个专业的 RPG 跑团向剧情策划师。请根据玩家要求、角色设定和聊天上下文，生成可商讨、可执行、带有阶段推进感的剧情规划。不要输出无关废话。';
    const DEFAULT_BREAKDOWN_SYSTEM_PROMPT = `你是 Plot Planner 的任务拆解器，只负责把已经敲定的剧情规划转换成可执行任务 JSON。

要求：
1. 只依据用户提供的“最终敲定的剧情规划”拆解，不要补充世界书、聊天记录或额外设定。
2. 输出必须是合法 JSON，不要 Markdown、代码块、解释、前后缀。
3. JSON 顶层必须是 {"tasks":[...]}。
4. 每个任务必须包含 title、summary、completionCriteria 三个字符串字段。
5. summary 要写成可发送给主聊天 AI 的当前剧情节点说明，包含目标、冲突/阻碍、可互动行动和边界。
6. completionCriteria 必须是能从主聊天 AI 回复中客观观察到的“小完成事实”，并提醒完成时只输出一次 <complete></complete>。
7. 每个任务只能包含一个核心戏剧拍点，不要把“铺垫、试探、反应、揭露、逃避、余波”等多个拍点合并成一个任务。
8. 任务必须线性衔接；当前任务不要提前完成后续任务，也不要替 {{user}} 做决定。`;
    const BREAKDOWN_REPAIR_SYSTEM_PROMPT = `你是 JSON 格式修复器。请把上一次任务拆解输出修复为合法 JSON。

要求：
1. 只输出 JSON，不要 Markdown、代码块、解释、前后缀。
2. JSON 顶层必须是 {"tasks":[...]}。
3. 每个任务必须包含 title、summary、completionCriteria 三个字符串字段。
4. 不要改变原剧情含义，只修复结构、字段和缺失的完成条件。`;
    const PLOT_OUTLINE_FORMAT_PROMPT = `请严格使用以下固定格式输出剧情规划，方便后续拆解：

【主线标题】
用一句话概括这条大型剧情任务。

【总体目标】
说明这条主线最终要达成什么。

【核心冲突】
说明主要矛盾、阻碍、风险或情感张力。

【关键角色与关系】
列出本剧情中最重要的角色、立场、关系变化。

【阶段规划】
阶段一：
- 阶段目标：
- 关键冲突：
- 主要事件：
- 玩家/角色可互动点：
- 阶段完成标志：

阶段二：
- 阶段目标：
- 关键冲突：
- 主要事件：
- 玩家/角色可互动点：
- 阶段完成标志：

（按需要继续阶段三、阶段四……）

【结局或收束方向】
说明剧情如何收束，或保留哪些后续钩子。`;
    const TASK_SCHEMA = {
        name: 'plot_planner_tasks',
        description: 'Ordered plot tasks',
        strict: true,
        value: {
            type: 'object',
            properties: {
                tasks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            summary: { type: 'string' },
                            completionCriteria: { type: 'string' }
                        },
                        required: ['title', 'summary', 'completionCriteria'],
                        additionalProperties: false
                    }
                }
            },
            required: ['tasks'],
            additionalProperties: false
        }
    };

    // ===== 等待依赖加载 =====
    async function init() {
        if (typeof $ === 'undefined' || typeof SillyTavern === 'undefined') {
            console.log('⏳ [PlotPlanner] 等待 SillyTavern 加载...');
            setTimeout(init, 500);
            return;
        }

        console.log('✅ [PlotPlanner] SillyTavern 已就绪，开始初始化 UI');

        // 注入 Modal HTML
        const modalHtml = `
<div id="plot-planner-modal" class="plot-planner-overlay" style="display: none;">
    <div class="plot-planner-container">
        <div class="plot-planner-header">
            <h2>🗺️ 剧情规划器 (Plot Planner)</h2>
            <div id="plot-planner-close" class="plot-planner-close-btn">&times;</div>
        </div>
        <div class="plot-planner-body">
            <div class="plot-planner-config plot-generation-panel" id="plot-planner-config-section">
                <div class="plot-generation-title">剧情生成</div>
                <div class="context-builder">
                    <div class="context-builder-title">剧情上下文</div>
                    <div class="context-options">
                        <label><input type="checkbox" id="plot-context-chat" checked> 最近聊天</label>
                        <label><input type="checkbox" id="plot-context-character" checked> 角色信息</label>
                        <label><input type="checkbox" id="plot-context-note" checked> 作者注释</label>
                        <label><input type="checkbox" id="plot-context-world" checked> 激活世界书</label>
                        <label>消息数 <input type="number" id="plot-context-count" value="20" min="1" max="200"></label>
                    </div>
                    <button id="plot-context-preview" class="plot-btn" type="button">预览本次上下文</button>
                    <details id="plot-context-preview-panel" class="context-preview-panel">
                        <summary id="plot-context-summary">尚未收集上下文</summary>
                        <pre id="plot-context-preview-text"></pre>
                    </details>
                </div>
                <div class="config-row">
                    <label>剧情方向/结局 (选填):</label>
                    <input type="text" id="plot-planner-direction" placeholder="例如：加入一点悬疑元素，结局是两人和好...">
                </div>
                <div class="config-row">
                    <label>期待任务节点数量:</label>
                    <input type="number" id="plot-planner-node-count" value="3" min="1" max="10">
                </div>
                <button id="plot-planner-generate-draft" class="plot-btn primary-btn" style="margin-top: 10px; width: 100%;">生成草案</button>
            </div>
            <details class="plot-planner-details" id="plot-planner-settings-details">
                <summary>⚙️ API / 提示词高级设置 (点击展开/折叠)</summary>
                <div class="plot-planner-details-content">
                    
                    <!-- 多配置管理 -->
                    <div class="plot-planner-api-config" style="margin-bottom: 10px; padding: 10px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 5px;">
                        <div class="config-row">
                            <label>配置档案 (Profile):</label>
                            <select id="plot-planner-profile-select" style="flex:1;">
                                <option value="default">默认配置 (Default)</option>
                            </select>
                            <button id="plot-planner-profile-save" class="plot-btn" style="margin-left: 5px;" title="保存当前设置到该档案">💾 保存</button>
                            <button id="plot-planner-profile-new" class="plot-btn success-btn" style="margin-left: 5px;" title="新建档案">➕ 新建</button>
                            <button id="plot-planner-profile-del" class="plot-btn warning-btn" style="margin-left: 5px;" title="删除档案">🗑️</button>
                        </div>
                    </div>

                    <!-- API 设置 -->
                    <div class="plot-planner-api-config" style="margin-bottom: 10px; padding: 10px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 5px;">
                        <div class="config-row">
                            <label>API 模式:</label>
                            <select id="plot-planner-api-mode">
                                <option value="st">酒馆当前模型 (SillyTavern API)</option>
                                <option value="custom">独立 OpenAI 兼容 API</option>
                            </select>
                        </div>
                        <div id="plot-planner-custom-api-settings" style="display: none; margin-top: 10px;">
                            <div class="config-row">
                                <label>API URL:</label>
                                <input type="text" id="plot-planner-api-url" placeholder="https://api.openai.com/v1/chat/completions">
                            </div>
                            <div class="config-row">
                                <label>API Key (安全):</label>
                                <input type="password" id="plot-planner-api-key" placeholder="将会在本地加密混淆存储">
                            </div>
                            <div class="config-row">
                                <label>模型 (Model):</label>
                                <select id="plot-planner-api-model-select" style="flex:1; display:none;"></select>
                                <input type="text" id="plot-planner-api-model" placeholder="gpt-3.5-turbo" style="flex:1;">
                                <button id="plot-planner-api-test" class="plot-btn" style="margin-left: 5px;">拉取模型测试</button>
                            </div>
                            <div style="font-size: 0.8rem; color: #888; margin-top: 5px;">注：直接请求外部 API 可能遇到浏览器跨域(CORS)拦截。如拉取模型失败，可直接手动输入模型名称兜底。</div>
                        </div>
                    </div>

                    <!-- 提示词预设 -->
                    <div class="plot-planner-config" style="margin-bottom: 10px;">
                        <div class="config-row">
                            <label>剧情规划模板:</label>
                            <select id="plot-planner-prompt-template" style="flex:1;">
                                <option value="custom">-- 自定义 --</option>
                            </select>
                            <button id="plot-planner-prompt-save" class="plot-btn success-btn" style="margin-left: 5px;">➕ 保存为自定义</button>
                            <button id="plot-planner-prompt-del" class="plot-btn warning-btn" style="margin-left: 5px; display:none;">🗑️</button>
                        </div>
                        <div class="config-row" style="align-items: flex-start; margin-top: 5px;">
                            <label>剧情内容提示词:</label>
                            <textarea id="plot-planner-system-prompt" style="flex:1; height: 80px; background: #121215; border: 1px solid #333; color: #fff; padding: 8px; border-radius: 4px; resize: vertical;" placeholder="用于生成和商讨剧情大纲，可自定义并保存。"></textarea>
                        </div>
                        <div class="config-row" style="align-items: flex-start; margin-top: 5px;">
                            <label>子任务拆解提示词:</label>
                            <textarea id="plot-planner-breakdown-prompt" style="flex:1; height: 110px; background: #121215; border: 1px solid #333; color: #fff; padding: 8px; border-radius: 4px; resize: vertical;" placeholder="专门用于把最终剧情大纲转换成 JSON 子任务。拆解请求只会发送此提示词和最终大纲。"></textarea>
                        </div>
                        <div style="font-size: 0.8rem; color: #888; margin-top: 5px;">说明：剧情规划提示词会结合上下文生成固定格式大纲；子任务拆解提示词只处理最终大纲，不会再次发送世界书/聊天等长上下文。</div>
                    </div>

                </div>
            </details>
            <div class="plot-planner-chat-area" id="plot-planner-chat-section">
                <div id="plot-planner-chat-history" class="chat-history">
                    <div class="chat-message system-msg">请在上方输入设定并点击"生成草案"，AI将为你构思带转折的剧情大纲。</div>
                </div>
                <div class="chat-input-row">
                    <input type="text" id="plot-planner-chat-input" placeholder="输入修改意见 (如：把转折改得更温和一点)..." disabled>
                    <button id="plot-planner-chat-send" class="plot-btn" disabled>发送</button>
                </div>
            </div>
            <div id="plot-planner-execution-area" class="execution-area" style="display: none;">
                <h3>当前剧情任务链</h3>
                <div class="execution-toolbar">
                    <button id="plot-planner-prev" class="plot-btn" type="button">上一步</button>
                    <button id="plot-planner-complete" class="plot-btn success-btn" type="button">手动完成</button>
                    <button id="plot-planner-skip" class="plot-btn warning-btn" type="button">跳过</button>
                    <button id="plot-planner-pause" class="plot-btn" type="button">暂停</button>
                    <button id="plot-planner-stop" class="plot-btn danger-btn" type="button">停止规划</button>
                    <button id="plot-planner-clear" class="plot-btn danger-btn" type="button">清空剧情</button>
                </div>
                <div id="plot-planner-tasks-list" class="tasks-list"></div>
            </div>
            <div id="plot-planner-error" class="plot-planner-error" style="display: none;">
                <span id="plot-planner-error-text"></span>
                <button id="plot-planner-retry" class="plot-btn" type="button">重试</button>
                <button id="plot-planner-cancel-request" class="plot-btn danger-btn" type="button">取消请求</button>
            </div>
        </div>
        <div class="plot-planner-footer">
            <button id="plot-planner-breakdown" class="plot-btn warning-btn" disabled>敲定并拆解任务</button>
            <button id="plot-planner-start" class="plot-btn success-btn" style="display: none;">正式启动剧情</button>
        </div>
    </div>
</div>`;
        $('body').append(modalHtml);

        // ===== 创建顶部栏按钮 =====
        $('#plot-planner-wrapper').remove();
        const $wrapper = $('<div>', { id: 'plot-planner-wrapper', class: 'drawer' });
        const $toggle = $('<div>', { class: 'drawer-toggle' });
        const $icon = $('<div>', {
            id: 'plot-planner-top-btn',
            class: 'drawer-icon fa-solid fa-map fa-fw interactable closedIcon',
            title: '剧情规划器 (Plot Planner)',
            tabindex: '0'
        });
        $toggle.append($icon);
        $wrapper.append($toggle);

        const $extBtn = $('#extensions-settings-button');
        if ($extBtn.length > 0) {
            $extBtn.after($wrapper);
        } else {
            $('#top-settings-holder').append($wrapper);
        }

        // ===== 绑定基础事件 =====
        $icon.on('click', toggleModal);
        $('#plot-planner-close').on('click', toggleModal);
        $('#plot-planner-generate-draft').on('click', handleGenerateDraft);
        $('#plot-planner-chat-send').on('click', handleChatSend);
        $('#plot-planner-chat-input').on('keypress', function (e) {
            if (e.which == 13) handleChatSend();
        });
        $('#plot-planner-breakdown').on('click', handleBreakdown);
        $('#plot-planner-start').on('click', handleStartExecution);
        $('#plot-context-preview').on('click', previewContext);
        $('#plot-planner-prev').on('click', () => moveTask(-1));
        $('#plot-planner-complete').on('click', () => completeCurrentTask('manual'));
        $('#plot-planner-skip').on('click', () => completeCurrentTask('skipped'));
        $('#plot-planner-pause').on('click', toggleExecutionPause);
        $('#plot-planner-stop').on('click', stopExecution);
        $('#plot-planner-clear').on('click', clearPlanner);
        $('#plot-planner-retry').on('click', retryLastAction);
        $('#plot-planner-cancel-request').on('click', cancelActiveRequest);
        $('#plot-context-chat, #plot-context-character, #plot-context-note, #plot-context-world, #plot-context-count')
            .on('change', savePlannerState);
        
        // 模式切换显示
        $('#plot-planner-api-mode').on('change', function() {
            if ($(this).val() === 'custom') {
                $('#plot-planner-custom-api-settings').slideDown(200);
            } else {
                $('#plot-planner-custom-api-settings').slideUp(200);
            }
        });

        // 按钮事件绑定
        $('#plot-planner-profile-new').on('click', createNewProfile);
        $('#plot-planner-profile-save').on('click', saveCurrentProfile);
        $('#plot-planner-profile-del').on('click', deleteCurrentProfile);
        $('#plot-planner-profile-select').on('change', loadSelectedProfile);
        
        $('#plot-planner-api-test').on('click', testApiAndFetchModels);
        
        $('#plot-planner-prompt-save').on('click', saveCustomPrompt);
        $('#plot-planner-prompt-del').on('click', deleteCustomPrompt);
        $('#plot-planner-prompt-template').on('change', onTemplateChange);

        // ===== 异步加载与初始化 =====
        await loadBuiltInPrompts();
        loadAllData();
        
        // ===== 注册消息监听 =====
        try {
            const context = SillyTavern.getContext();
            if (context && context.eventSource) {
                context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, function (messageId) {
                    onMessageReceived(messageId);
                });
                context.eventSource.on(context.event_types.CHAT_CHANGED, function () {
                    loadPlannerState();
                });
            }
        } catch (e) {
            console.error('❌ [PlotPlanner] 注册事件监听失败:', e);
        }

        loadPlannerState();
    }

    // ===== 轻量混淆加密 (Obfuscation) =====
    const obfKey = "plot_planner_secret_2026";
    function obfuscate(text) {
        if (!text) return "";
        let res = "";
        for (let i = 0; i < text.length; i++) {
            res += String.fromCharCode(text.charCodeAt(i) ^ obfKey.charCodeAt(i % obfKey.length));
        }
        return btoa(unescape(encodeURIComponent(res)));
    }
    function deobfuscate(b64) {
        if (!b64) return "";
        try {
            let text = decodeURIComponent(escape(atob(b64)));
            let res = "";
            for (let i = 0; i < text.length; i++) {
                res += String.fromCharCode(text.charCodeAt(i) ^ obfKey.charCodeAt(i % obfKey.length));
            }
            return res;
        } catch (e) {
            return b64; // 若解密失败返回原样(兼容旧版明文)
        }
    }

    // ===== 存储加载与渲染 =====
    function loadAllData() {
        // 1. 加载 Custom Prompts
        try {
            const cp = localStorage.getItem('plotPlannerCustomPrompts');
            if (cp) customPrompts = JSON.parse(cp);
        } catch(e){}
        renderPromptDropdown();

        // 2. 加载 Profiles
        try {
            const profilesRaw = localStorage.getItem('plotPlannerProfiles');
            if (profilesRaw) {
                apiProfiles = JSON.parse(profilesRaw);
            } else {
                apiProfiles = [{
                    id: 'default',
                    name: '默认配置',
                    mode: 'st',
                    url: '',
                    key: '',
                    model: '',
                    promptId: 'default_safe',
                    systemPrompt: builtInPrompts.find(p=>p.id==='default_safe')?.prompt || DEFAULT_PLANNING_SYSTEM_PROMPT,
                    breakdownPrompt: DEFAULT_BREAKDOWN_SYSTEM_PROMPT
                }];
            }
            apiProfiles = apiProfiles.map(profile => ({
                ...profile,
                systemPrompt: profile.systemPrompt || DEFAULT_PLANNING_SYSTEM_PROMPT,
                breakdownPrompt: profile.breakdownPrompt || DEFAULT_BREAKDOWN_SYSTEM_PROMPT
            }));
            const lastId = localStorage.getItem('plotPlannerLastProfile');
            if (lastId && apiProfiles.find(p => p.id === lastId)) {
                currentProfileId = lastId;
            } else {
                currentProfileId = apiProfiles[0].id;
            }
        } catch(e) {
            apiProfiles = [];
        }
        renderProfileDropdown();
        loadSelectedProfile();
    }

    // ===== 提示词系统 =====
    async function loadBuiltInPrompts() {
        try {
            const promptsUrl = new URL('./prompts.json', import.meta.url);
            const res = await fetch(promptsUrl);
            if (res.ok) {
                builtInPrompts = await res.json();
            } else {
                console.warn("[PlotPlanner] 未能加载内置 prompts.json");
            }
        } catch(e) {
            console.warn("[PlotPlanner] fetch prompts.json 失败", e);
        }
    }

    function renderPromptDropdown() {
        const $sel = $('#plot-planner-prompt-template');
        $sel.empty();
        
        $sel.append('<optgroup label="内置模板 (不可覆盖)" id="opt-builtin"></optgroup>');
        builtInPrompts.forEach(p => {
            $('#opt-builtin').append($('<option>', {value: p.id, text: p.name}));
        });
        
        if (customPrompts.length > 0) {
            $sel.append('<optgroup label="自定义模板" id="opt-custom"></optgroup>');
            customPrompts.forEach(p => {
                $('#opt-custom').append($('<option>', {value: p.id, text: p.name}));
            });
        }
        $sel.append('<option value="custom">-- 临时自定义 (不保存) --</option>');
    }

    function onTemplateChange() {
        const val = $('#plot-planner-prompt-template').val();
        if (val === 'custom') {
            $('#plot-planner-prompt-del').hide();
            return;
        }
        
        let p = builtInPrompts.find(x => x.id === val);
        if (p) {
            $('#plot-planner-system-prompt').val(p.prompt);
            $('#plot-planner-prompt-del').hide();
            return;
        }
        
        p = customPrompts.find(x => x.id === val);
        if (p) {
            $('#plot-planner-system-prompt').val(p.prompt);
            $('#plot-planner-prompt-del').show();
        }
    }

    function saveCustomPrompt() {
        const content = $('#plot-planner-system-prompt').val().trim();
        if(!content) return alert("系统提示词不能为空");
        let name = prompt("请输入此自定义模板的名称：");
        if (!name) return;
        
        const id = 'custom_' + Date.now();
        customPrompts.push({ id, name, prompt: content });
        localStorage.setItem('plotPlannerCustomPrompts', JSON.stringify(customPrompts));
        renderPromptDropdown();
        $('#plot-planner-prompt-template').val(id);
        onTemplateChange();
        if (typeof toastr !== 'undefined') toastr.success("模板已保存");
    }

    function deleteCustomPrompt() {
        const val = $('#plot-planner-prompt-template').val();
        if (val.startsWith('custom_')) {
            if(!confirm("确定要删除此自定义模板吗？")) return;
            customPrompts = customPrompts.filter(p => p.id !== val);
            localStorage.setItem('plotPlannerCustomPrompts', JSON.stringify(customPrompts));
            renderPromptDropdown();
            $('#plot-planner-prompt-template').val('custom');
            onTemplateChange();
        }
    }

    // ===== 多配置(Profile)系统 =====
    function renderProfileDropdown() {
        const $sel = $('#plot-planner-profile-select');
        $sel.empty();
        apiProfiles.forEach(p => {
            $sel.append($('<option>', {value: p.id, text: p.name}));
        });
        $sel.val(currentProfileId);
    }

    function saveCurrentProfile() {
        let p = apiProfiles.find(x => x.id === currentProfileId);
        if (!p) return;
        
        p.mode = $('#plot-planner-api-mode').val();
        p.url = $('#plot-planner-api-url').val();
        // 混淆加密存储 Key
        p.key = obfuscate($('#plot-planner-api-key').val());
        p.model = $('#plot-planner-api-model').is(':visible') ? $('#plot-planner-api-model').val() : $('#plot-planner-api-model-select').val();
        p.promptId = $('#plot-planner-prompt-template').val();
        p.systemPrompt = $('#plot-planner-system-prompt').val();
        p.breakdownPrompt = $('#plot-planner-breakdown-prompt').val();

        localStorage.setItem('plotPlannerProfiles', JSON.stringify(apiProfiles));
        localStorage.setItem('plotPlannerLastProfile', currentProfileId);
        if (typeof toastr !== 'undefined') toastr.success("配置已保存到当前档案");
    }

    function loadSelectedProfile() {
        currentProfileId = $('#plot-planner-profile-select').val();
        let p = apiProfiles.find(x => x.id === currentProfileId);
        if (!p) return;
        
        $('#plot-planner-api-mode').val(p.mode || 'st').trigger('change');
        $('#plot-planner-api-url').val(p.url || '');
        // 解密渲染 Key
        $('#plot-planner-api-key').val(deobfuscate(p.key || ''));
        
        // 恢复模型显示，默认用输入框
        $('#plot-planner-api-model-select').hide();
        $('#plot-planner-api-model').show().val(p.model || '');
        
        $('#plot-planner-prompt-template').val(p.promptId || 'custom');
        onTemplateChange();
        $('#plot-planner-system-prompt').val(p.systemPrompt || $('#plot-planner-system-prompt').val() || DEFAULT_PLANNING_SYSTEM_PROMPT);
        $('#plot-planner-breakdown-prompt').val(p.breakdownPrompt || DEFAULT_BREAKDOWN_SYSTEM_PROMPT);
        localStorage.setItem('plotPlannerLastProfile', currentProfileId);
    }

    function createNewProfile() {
        let name = prompt("请输入新配置的名称：");
        if (!name) return;
        
        const newId = 'prof_' + Date.now();
        apiProfiles.push({
            id: newId,
            name: name,
            mode: 'custom',
            url: '',
            key: '',
            model: '',
            promptId: 'custom',
            systemPrompt: builtInPrompts.find(p=>p.id==='default_safe')?.prompt || DEFAULT_PLANNING_SYSTEM_PROMPT,
            breakdownPrompt: DEFAULT_BREAKDOWN_SYSTEM_PROMPT
        });
        currentProfileId = newId;
        renderProfileDropdown();
        loadSelectedProfile();
        saveCurrentProfile();
    }

    function deleteCurrentProfile() {
        if (apiProfiles.length <= 1) {
            alert("至少需要保留一个配置档案。");
            return;
        }
        if(!confirm("确定要删除当前配置文件吗？")) return;
        
        apiProfiles = apiProfiles.filter(x => x.id !== currentProfileId);
        currentProfileId = apiProfiles[0].id;
        renderProfileDropdown();
        loadSelectedProfile();
        saveCurrentProfile();
    }

    // ===== API 模型测试拉取 =====
    async function testApiAndFetchModels() {
        const url = $('#plot-planner-api-url').val().trim();
        const key = $('#plot-planner-api-key').val().trim();
        
        if (!url) return alert("请先填写 API URL");
        
        $('#plot-planner-api-test').prop('disabled', true).text('拉取中...');
        try {
            // 解析 base url。例如 https://api.openai.com/v1/chat/completions -> https://api.openai.com/v1/models
            let baseUrl = url;
            if (url.includes('/chat/completions')) {
                baseUrl = url.replace('/chat/completions', '/models');
            } else if (!url.endsWith('/models')) {
                // 如果用户没填完整，尝试补齐
                baseUrl = url.endsWith('/') ? url + 'models' : url + '/models';
            }

            const response = await fetch(baseUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${key}`
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            if (data && data.data && Array.isArray(data.data)) {
                // 成功拉取
                const $sel = $('#plot-planner-api-model-select');
                $sel.empty();
                data.data.forEach(m => {
                    $sel.append($('<option>', {value: m.id, text: m.id}));
                });
                
                $('#plot-planner-api-model').hide();
                $sel.show();
                if (typeof toastr !== 'undefined') toastr.success(`连接成功！拉取到 ${data.data.length} 个模型。`);
            } else {
                throw new Error("返回的 JSON 结构不符合 OpenAI 标准规范 (/v1/models)");
            }
        } catch(e) {
            alert(`拉取失败，您可以直接在下方手动输入模型名称。\n错误详情：${e.message}`);
            $('#plot-planner-api-model-select').hide();
            $('#plot-planner-api-model').show();
        }
        $('#plot-planner-api-test').prop('disabled', false).text('拉取模型测试');
    }

    // ===== UI 与杂项 =====
    function toggleModal() {
        isModalOpen = !isModalOpen;
        if (isModalOpen) {
            $('#plot-planner-modal').fadeIn(200);
        } else {
            $('#plot-planner-modal').fadeOut(200);
        }
    }

    function appendMiniChat(role, text) {
        const className = role === 'user' ? 'user-msg' : 'ai-msg';
        const msgDiv = $('<div>').addClass(`chat-message ${className}`).text(text);
        $('#plot-planner-chat-history').append(msgDiv);
        const chatHist = document.getElementById('plot-planner-chat-history');
        if (chatHist) chatHist.scrollTop = chatHist.scrollHeight;
    }

    function getContextSettings() {
        return {
            includeChat: $('#plot-context-chat').prop('checked'),
            includeCharacter: $('#plot-context-character').prop('checked'),
            includeNote: $('#plot-context-note').prop('checked'),
            includeWorld: $('#plot-context-world').prop('checked'),
            messageCount: Math.max(1, Math.min(200, Number($('#plot-context-count').val()) || 20))
        };
    }

    async function buildPlotContext() {
        const context = SillyTavern.getContext();
        const settings = getContextSettings();
        const sections = [];
        const stats = [];
        const recentChat = Array.isArray(context.chat) ? context.chat.slice(-settings.messageCount) : [];

        if (settings.includeCharacter && typeof context.getCharacterCardFields === 'function') {
            const fields = context.getCharacterCardFields();
            const characterText = [
                fields.description && `角色描述：\n${fields.description}`,
                fields.personality && `角色性格：\n${fields.personality}`,
                fields.scenario && `当前场景：\n${fields.scenario}`,
                fields.persona && `用户设定：\n${fields.persona}`
            ].filter(Boolean).join('\n\n');
            if (characterText) {
                sections.push(`【角色与场景】\n${characterText}`);
                stats.push('角色信息');
            }
        }

        if (settings.includeNote) {
            const note = context.chatMetadata?.note_prompt || '';
            if (note.trim()) {
                sections.push(`【作者注释】\n${note.trim()}`);
                stats.push('作者注释');
            }
        }

        if (settings.includeWorld && typeof context.getWorldInfoPrompt === 'function') {
            const fields = typeof context.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
            const chatForWorldInfo = recentChat.map(message => {
                const name = message.name || (message.is_user ? context.name1 : context.name2) || '';
                return `${name}: ${message.mes || ''}`;
            }).reverse();
            const worldInfo = await context.getWorldInfoPrompt(chatForWorldInfo, context.maxContext || 8192, true, {
                personaDescription: fields.persona || '',
                characterDescription: fields.description || '',
                characterPersonality: fields.personality || '',
                characterDepthPrompt: fields.charDepthPrompt || '',
                scenario: fields.scenario || '',
                creatorNotes: fields.creatorNotes || '',
                trigger: 'normal'
            });
            const worldText = [
                worldInfo.worldInfoBefore,
                worldInfo.worldInfoAfter,
                ...(worldInfo.worldInfoExamples || []).map(entry => entry.content || ''),
                ...(worldInfo.worldInfoDepth || []).flatMap(group => group.entries || []),
                ...(worldInfo.anBefore || []),
                ...(worldInfo.anAfter || []),
                ...Object.values(worldInfo.outletEntries || {}).flat()
            ].filter(Boolean).join('\n\n');
            if (worldText) {
                sections.push(`【当前激活的世界书】\n${worldText}`);
                stats.push('世界书');
            }
        }

        if (settings.includeChat && recentChat.length > 0) {
            const chatText = recentChat.map(message => {
                const name = message.name || (message.is_user ? context.name1 : context.name2) || '未知';
                return `${name}: ${message.mes || ''}`;
            }).join('\n');
            sections.push(`【最近 ${recentChat.length} 条聊天】\n${chatText}`);
            stats.push(`${recentChat.length} 条聊天`);
        }

        return {
            text: sections.join('\n\n'),
            summary: stats.length ? `已收集：${stats.join('、')}` : '没有可用的上下文',
            settings
        };
    }

    async function previewContext() {
        try {
            setBusyButton('#plot-context-preview', true, '收集中...');
            const result = await buildPlotContext();
            $('#plot-context-summary').text(result.summary);
            $('#plot-context-preview-text').text(result.text || '当前选项没有收集到内容。');
            $('#plot-context-preview-panel').attr('open', true);
        } catch (error) {
            showError('上下文收集失败', error, previewContext);
        } finally {
            setBusyButton('#plot-context-preview', false, '预览本次上下文');
        }
    }

    function snapshotPlannerState() {
        return {
            version: 2,
            draft: currentDraft,
            history: miniChatHistory,
            tasks: currentTasks,
            activeTaskIndex,
            paused: isExecutionPaused,
            direction: $('#plot-planner-direction').val() || '',
            nodeCount: Number($('#plot-planner-node-count').val()) || 3,
            contextSettings: getContextSettings()
        };
    }

    function savePlannerState() {
        const context = SillyTavern.getContext();
        if (!context?.chatMetadata) return;
        context.chatMetadata[STATE_KEY] = snapshotPlannerState();
        context.saveMetadataDebounced?.();
    }

    function loadPlannerState() {
        const context = SillyTavern.getContext();
        const state = context?.chatMetadata?.[STATE_KEY];
        currentDraft = state?.draft || '';
        miniChatHistory = Array.isArray(state?.history) ? state.history : [];
        currentTasks = Array.isArray(state?.tasks) ? state.tasks.map(normalizeTask) : [];
        activeTaskIndex = Number.isInteger(state?.activeTaskIndex) ? state.activeTaskIndex : -1;
        isExecutionPaused = Boolean(state?.paused);

        $('#plot-planner-chat-history').empty().append(
            $('<div>').addClass('chat-message system-msg').text('生成草案后，可以继续提出修改意见。')
        );
        miniChatHistory.forEach(message => appendMiniChat(message.role, message.content));
        $('#plot-planner-direction').val(state?.direction || '');
        $('#plot-planner-node-count').val(state?.nodeCount || 3);

        const settings = state?.contextSettings || {};
        $('#plot-context-chat').prop('checked', settings.includeChat !== false);
        $('#plot-context-character').prop('checked', settings.includeCharacter !== false);
        $('#plot-context-note').prop('checked', settings.includeNote !== false);
        $('#plot-context-world').prop('checked', settings.includeWorld !== false);
        $('#plot-context-count').val(settings.messageCount || 20);

        const hasDraft = Boolean(currentDraft);
        $('#plot-planner-chat-input, #plot-planner-chat-send, #plot-planner-breakdown').prop('disabled', !hasDraft);
        $('#plot-planner-execution-area').toggle(currentTasks.length > 0);
        $('#plot-planner-chat-section').toggle(currentTasks.length === 0);
        $('#plot-planner-start').toggle(currentTasks.length > 0 && activeTaskIndex < 0);
        $('#plot-planner-breakdown').toggle(currentTasks.length === 0);
        updatePauseButton();
        renderTasks();
        updatePromptInjection();
    }

    function setBusyButton(selector, busy, busyText) {
        const button = $(selector);
        if (!button.data('idle-text')) button.data('idle-text', button.text());
        button.prop('disabled', busy).text(busy ? busyText : button.data('idle-text'));
    }

    function showError(message, error, retryAction) {
        console.error(`[PlotPlanner] ${message}`, error);
        lastFailedAction = typeof retryAction === 'function' ? retryAction : null;
        $('#plot-planner-error-text').text(`${message}：${error?.message || error}`);
        $('#plot-planner-retry').toggle(Boolean(lastFailedAction));
        $('#plot-planner-error').css('display', 'flex');
    }

    function notify(level, message) {
        if (typeof toastr !== 'undefined' && typeof toastr[level] === 'function') {
            toastr[level](message, 'Plot Planner');
        }
    }

    function normalizeTask(task, index) {
        if (typeof task === 'string') {
            return {
                title: `任务 ${index + 1}`,
                summary: task,
                completionCriteria: '该节点的核心事件已经在剧情中明确发生。',
                status: 'pending'
            };
        }
        return {
            title: String(task?.title || `任务 ${index + 1}`),
            summary: String(task?.summary || ''),
            completionCriteria: String(task?.completionCriteria || '该节点的核心事件已经在角色回复中明确发生，且没有只停留在计划或预告。'),
            status: ['pending', 'active', 'completed', 'skipped'].includes(task?.status) ? task.status : 'pending'
        };
    }

    function clearError() {
        $('#plot-planner-error').hide();
        lastFailedAction = null;
    }

    function retryLastAction() {
        const action = lastFailedAction;
        clearError();
        action?.();
    }

    function cancelActiveRequest() {
        if (!activeRequest) return;
        activeRequest.cancelled = true;
        activeRequest.controller?.abort();
        const context = SillyTavern.getContext();
        context.eventSource?.emit(context.event_types.GENERATION_STOPPED);
        activeRequest = null;
        $('#plot-planner-cancel-request').prop('disabled', true);
    }

    // ===== 调用 LLM =====
    async function callLLM(promptText, options = {}) {
        const mode = $('#plot-planner-api-mode').val();
        let systemPrompt = String(options.systemPrompt ?? $('#plot-planner-system-prompt').val() ?? '').trim();
        if (!systemPrompt) systemPrompt = DEFAULT_PLANNING_SYSTEM_PROMPT;

        if (activeRequest) throw new Error('已有一个剧情规划请求正在进行');
        const request = { controller: new AbortController(), cancelled: false };
        activeRequest = request;
        $('#plot-planner-cancel-request').prop('disabled', false);
        clearError();

        const timeoutPromise = new Promise((_, reject) => {
            request.timeoutId = setTimeout(() => reject(new Error('请求超时，请重试或检查模型连接')), REQUEST_TIMEOUT_MS);
        });

        try {
            console.log("[PlotPlanner] 发送给大模型的 Prompt (模式: " + mode + ")");
            const generationPromise = mode === 'custom'
                ? callCustomApi(promptText, systemPrompt, options, request.controller.signal)
                : callSillyTavernApi(promptText, systemPrompt, options);
            const response = await Promise.race([generationPromise, timeoutPromise]);
            if (request.cancelled) throw new Error('请求已取消');
            if (!response) throw new Error('模型返回了空结果');
            return response;
        } finally {
            clearTimeout(request.timeoutId);
            if (activeRequest === request) activeRequest = null;
            $('#plot-planner-cancel-request').prop('disabled', true);
        }
    }

    async function callCustomApi(promptText, systemPrompt, options, signal) {
        const url = $('#plot-planner-api-url').val().trim();
        const key = $('#plot-planner-api-key').val().trim();
        const model = $('#plot-planner-api-model').is(':visible')
            ? $('#plot-planner-api-model').val().trim()
            : $('#plot-planner-api-model-select').val();
        if (!url) throw new Error("独立 API URL 未配置，请填写完整 API 地址");

        const body = {
            model: model || 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: promptText }
            ],
            temperature: options.temperature ?? 0.7
        };
        if (options.jsonSchema) {
            body.response_format = {
                type: 'json_schema',
                json_schema: {
                    name: options.jsonSchema.name,
                    description: options.jsonSchema.description,
                    strict: options.jsonSchema.strict,
                    schema: options.jsonSchema.value
                }
            };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(body),
            signal
        });
        if (!response.ok) throw new Error(`HTTP 错误 ${response.status}`);
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("模型返回了异常结构结果");
        return content;
    }

    async function callSillyTavernApi(promptText, systemPrompt, options) {
        const context = SillyTavern.getContext();
        if (!context || typeof context.generateRaw !== 'function') {
            throw new Error("SillyTavern API 不可用。请确保已连接大模型。");
        }
        return context.generateRaw({
            prompt: promptText,
            systemPrompt,
            jsonSchema: options.jsonSchema || null,
            responseLength: options.responseLength || null
        });
    }

    function parseJsonResponse(text) {
        if (typeof text !== 'string') return text;
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        try {
            return JSON.parse(cleaned);
        } catch (firstError) {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                try {
                    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
                } catch (objectError) {
                    console.warn('[PlotPlanner] JSON 对象截取解析失败，继续尝试数组截取。', objectError);
                }
            }
            const firstBracket = cleaned.indexOf('[');
            const lastBracket = cleaned.lastIndexOf(']');
            if (firstBracket >= 0 && lastBracket > firstBracket) {
                return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
            }
            throw firstError;
        }
    }

    function parseTaskBreakdownResponse(response) {
        const parsed = parseJsonResponse(response);
        if (!parsed || !Array.isArray(parsed.tasks)) {
            throw new Error('模型没有返回 {"tasks":[...]} 结构');
        }

        const tasks = parsed.tasks.map((task, index) => ({
            title: String(task?.title || `任务 ${index + 1}`).trim(),
            summary: String(task?.summary || '').trim(),
            completionCriteria: String(task?.completionCriteria || '').trim()
        })).filter(task => task.title && task.summary && task.completionCriteria);

        if (tasks.length === 0) {
            throw new Error('模型返回的任务缺少 title、summary 或 completionCriteria');
        }
        return tasks;
    }

    async function callStructuredLLM(promptText, jsonSchema, options = {}) {
        try {
            return await callLLM(promptText, { ...options, jsonSchema });
        } catch (error) {
            const message = String(error?.message || error);
            if (/取消|超时|正在进行|未配置|HTTP 40[13]/i.test(message)) throw error;
            console.warn('[PlotPlanner] 当前模型不支持原生 JSON Schema，改用 JSON 文本模式。', error);
            const schemaText = JSON.stringify(jsonSchema.value);
            return callLLM(`${promptText}\n\n必须只输出 JSON，不要使用代码块。JSON Schema：\n${schemaText}`, options);
        }
    }

    async function repairTaskJson(rawResponse) {
        const prompt = `请修复下面这段任务拆解输出，使它变成合法 JSON，并符合指定结构。

【指定结构】
{
  "tasks": [
    {
      "title": "简短任务标题",
      "summary": "当前剧情节点说明，包含目标、冲突/阻碍、可互动行动和边界。",
      "completionCriteria": "最近一步可观察的小完成事实；完成时只输出一次 <complete></complete>。"
    }
  ]
}

【需要修复的输出】
${String(rawResponse || '')}`;
        return callStructuredLLM(prompt, TASK_SCHEMA, {
            temperature: 0,
            responseLength: 2048,
            systemPrompt: BREAKDOWN_REPAIR_SYSTEM_PROMPT
        });
    }

    // ===== 阶段1: 生成草案 =====
    async function handleGenerateDraft() {
        saveCurrentProfile(); // 点击生成时自动保存一下当前配置
        const direction = $('#plot-planner-direction').val();
        const nodeCount = $('#plot-planner-node-count').val();
        let plotContext;
        try {
            setBusyButton('#plot-planner-generate-draft', true, '生成中...');
            plotContext = await buildPlotContext();
            $('#plot-context-summary').text(plotContext.summary);
            $('#plot-context-preview-text').text(plotContext.text || '当前选项没有收集到内容。');

            let prompt = `请基于以下剧情上下文，为接下来的剧情生成一份可继续商讨的固定格式剧情规划。\n\n${plotContext.text || '【剧情上下文】无'}\n\n`;
            if (direction) prompt += `【玩家要求的方向或结局】\n${direction}\n\n`;
            prompt += `【期望阶段数量】\n大约 ${nodeCount} 个阶段。\n\n`;
            prompt += `${PLOT_OUTLINE_FORMAT_PROMPT}\n\n请只输出上述固定格式的剧情规划，不要输出 JSON。`;

            const response = await callLLM(prompt);
            currentDraft = response;
            miniChatHistory = [{ role: 'ai', content: response }];
            $('#plot-planner-chat-history').empty();
            appendMiniChat('ai', response);
            $('#plot-planner-chat-input, #plot-planner-chat-send, #plot-planner-breakdown').prop('disabled', false);
            savePlannerState();
        } catch (error) {
            showError('生成草案失败', error, handleGenerateDraft);
        } finally {
            setBusyButton('#plot-planner-generate-draft', false, '重新生成草案');
        }
    }

    // ===== 商讨消息 =====
    async function handleChatSend(retryText = '') {
        const text = typeof retryText === 'string' && retryText
            ? retryText
            : $('#plot-planner-chat-input').val().trim();
        if (!text) return;

        $('#plot-planner-chat-input').val('');
        appendMiniChat('user', text);
        miniChatHistory.push({ role: 'user', content: text });

        try {
            setBusyButton('#plot-planner-chat-send', true, '修改中...');
            const recentDiscussion = miniChatHistory.slice(-6).map(message =>
                `${message.role === 'user' ? '玩家' : '规划器'}：${message.content}`
            ).join('\n\n');
            const prompt = `请修改当前剧情大纲。必须保留未被修改意见否定的有效内容，并返回一份完整的最新版大纲。
必须继续使用固定格式，不能改成 JSON，也不能只回复局部修改。

【当前大纲】
${currentDraft}

【最近商讨】
${recentDiscussion}

【本轮修改意见】
${text}

【固定格式要求】
${PLOT_OUTLINE_FORMAT_PROMPT}`;
            const response = await callLLM(prompt);
            currentDraft = response;
            appendMiniChat('ai', response);
            miniChatHistory.push({ role: 'ai', content: response });
            savePlannerState();
        } catch (error) {
            showError('修改大纲失败', error, () => handleChatSend(text));
        } finally {
            setBusyButton('#plot-planner-chat-send', false, '发送');
        }
    }

    // ===== 阶段2: 拆解任务 =====
    async function handleBreakdown() {
        try {
            setBusyButton('#plot-planner-breakdown', true, '拆解中...');
            const nodeCount = Math.max(1, Math.min(10, Number($('#plot-planner-node-count').val()) || 3));
            const breakdownSystemPrompt = $('#plot-planner-breakdown-prompt').val().trim() || DEFAULT_BREAKDOWN_SYSTEM_PROMPT;
            const prompt = `请把下面“最终敲定的剧情规划”转换成可逐步发送给 SillyTavern 主聊天 AI 执行的任务 JSON。

【期望任务数量】
大约 ${nodeCount} 个任务；如果剧情天然需要，可以少量增减。

【必须返回的 JSON 结构】
{
  "tasks": [
    {
      "title": "简短任务标题",
      "summary": "当前剧情节点说明，包含目标、冲突/阻碍、可互动行动和边界。",
      "completionCriteria": "最近一步可观察的小完成事实；完成时只输出一次 <complete></complete>。"
    }
  ]
}

【拆解节奏要求】
- 每个任务只能包含一个核心戏剧拍点，例如铺垫、试探、反应、揭露、逃避、余波只能选择其中一类作为重点。
- 不要把多个连续结果合并进一个任务；如果剧情包含“铺垫→试探→破防→逃离→余波”，必须拆成多个任务。
- completionCriteria 必须描述最近一步已经发生的可观察事实，不要写成整段剧情的最终结局。
- summary 必须约束主聊天 AI 不得替 {{user}} 做决定，不得提前完成后续节点。

【最终敲定的剧情规划】
${currentDraft}`;
            const response = await callStructuredLLM(prompt, TASK_SCHEMA, {
                temperature: 0.2,
                responseLength: 4096,
                systemPrompt: breakdownSystemPrompt
            });
            let tasks;
            try {
                tasks = parseTaskBreakdownResponse(response);
            } catch (parseError) {
                console.warn('[PlotPlanner] 首次任务拆解 JSON 无效，尝试请求模型修复格式。', parseError);
                const repairedResponse = await repairTaskJson(response);
                tasks = parseTaskBreakdownResponse(repairedResponse);
            }
            if (!Array.isArray(tasks) || tasks.length === 0) {
                throw new Error('模型没有返回有效任务');
            }
            currentTasks = tasks.map((task, index) => ({
                title: String(task.title || `任务 ${index + 1}`).trim(),
                summary: String(task.summary || '').trim(),
                completionCriteria: String(task.completionCriteria || '该节点最近一步核心事件已经在角色回复中明确发生；完成时只输出一次 <complete></complete>。').trim(),
                status: 'pending'
            })).filter(task => task.title || task.summary);
            activeTaskIndex = -1;
            renderTasks();
            savePlannerState();

            $('#plot-planner-settings-details').removeAttr('open');
            $('#plot-planner-chat-section').slideUp();
            $('#plot-planner-execution-area').slideDown();
            $('#plot-planner-start').show();
            $('#plot-planner-breakdown').hide();
        } catch (error) {
            showError('拆解任务失败', error, handleBreakdown);
        } finally {
            setBusyButton('#plot-planner-breakdown', false, '敲定并拆解任务');
        }
    }

    function renderTasks() {
        const list = $('#plot-planner-tasks-list');
        list.empty();

        currentTasks.forEach((task, index) => {
            const isActive = index === activeTaskIndex ? 'active' : '';
            const isCompleted = task.status === 'completed' || task.status === 'skipped' ? 'completed' : '';

            const itemDiv = $('<div>').addClass(`task-item ${isActive} ${isCompleted}`);
            const headerDiv = $('<div>').addClass('task-header');
            
            headerDiv.append($('<span>').text(`${index + 1}. ${task.title || '未命名任务'}`));
            if (index === activeTaskIndex) headerDiv.append($('<span>').text('(当前进行中)'));
            if (task.status === 'completed') headerDiv.append($('<span>').text('(已完成)'));
            if (task.status === 'skipped') headerDiv.append($('<span>').text('(已跳过)'));
            
            const summary = $('<textarea>')
                .addClass('task-content')
                .attr('aria-label', `任务 ${index + 1} 内容`)
                .data({ index, field: 'summary' })
                .val(task.summary || '');
            const criteria = $('<textarea>')
                .addClass('task-content task-criteria')
                .attr('aria-label', `任务 ${index + 1} 完成条件`)
                .data({ index, field: 'completionCriteria' })
                .val(task.completionCriteria || '');
            
            itemDiv.append(headerDiv)
                .append($('<label>').addClass('task-field-label').text('剧情内容'))
                .append(summary)
                .append($('<label>').addClass('task-field-label').text('完成条件'))
                .append(criteria);
            list.append(itemDiv);
        });

        $('.task-content').on('change', function () {
            const idx = $(this).data('index');
            const field = $(this).data('field');
            if (currentTasks[idx] && field) currentTasks[idx][field] = $(this).val();
            savePlannerState();
        });

        const hasActiveTask = activeTaskIndex >= 0 && activeTaskIndex < currentTasks.length;
        $('#plot-planner-prev').prop('disabled', activeTaskIndex <= 0);
        $('#plot-planner-complete, #plot-planner-skip, #plot-planner-pause').prop('disabled', !hasActiveTask);
    }

    // ===== 注入与清理 Prompt =====
    function updatePromptInjection() {
        const context = SillyTavern.getContext();
        if (!context || typeof context.setExtensionPrompt !== 'function') return;

        if (activeTaskIndex >= 0 && activeTaskIndex < currentTasks.length) {
            const currentTask = currentTasks[activeTaskIndex];
            const injectionText = isExecutionPaused ? '' : `[System Note (Plot Planner):
你正在执行一个分阶段 RPG 剧情任务链。当前只执行下面这个节点。不要提及“剧情规划器”或这些系统指令。

当前任务进度：${activeTaskIndex + 1}/${currentTasks.length}
当前剧情节点：${currentTask.title}

节点内容：
${currentTask.summary}

完成条件：
${currentTask.completionCriteria}

执行边界：
- 本轮只推进“当前剧情节点”，不得提前完成、预告、概括或跳转到后续节点。
- 不得替 {{user}} 做决定，不得描写 {{user}} 已经选择、同意、拒绝、行动、回复、离开、攻击、亲密接触或使用能力，除非这些行为已经由 {{user}} 在上一条消息中明确给出。
- 不得抢话。涉及 {{user}} 的关键选择、态度、回应、行动结果时，必须停下来等待 {{user}}。
- 不得为了完成任务而强行推进时间、地点、关系状态或重大冲突结果。
- 每次回复最多推进一个核心戏剧拍点：铺垫、试探、反应、揭露、逃避、余波只能选择其中一类作为重点。
- 如果当前节点尚未自然完成，只能继续铺垫、制造压力、给出可回应的局面，不得输出完成标签。
- 如果当前节点已经在当前回复中明确完成，只输出一次 <complete></complete> 作为隐藏完成标记；不要在草稿、摘要、状态栏、选项或解释中提到完成标签。
- 输出 <complete></complete> 后，不得继续推进下一节点。]`;
            
            // IN_PROMPT places the task with extension/system prompts, after world info in Chat Completion flows.
            context.setExtensionPrompt('plot-planner', injectionText, EXTENSION_PROMPT_TYPES.IN_PROMPT, 0);
            console.log("[PlotPlanner] 已更新任务提示词:", currentTask.title);
        } else {
            context.setExtensionPrompt('plot-planner', '', EXTENSION_PROMPT_TYPES.IN_PROMPT, 0);
            console.log("[PlotPlanner] 已清除任务提示词");
        }
    }

    // ===== 正式启动 =====
    function handleStartExecution() {
        activeTaskIndex = 0;
        currentTasks.forEach(task => {
            if (!task.status || task.status === 'active') task.status = 'pending';
        });
        currentTasks[0].status = 'active';
        isExecutionPaused = false;
        renderTasks();
        toggleModal();
        updatePromptInjection();
        savePlannerState();
        if (typeof toastr !== 'undefined') {
            toastr.success("🗺️ 剧情规划已启动！当前执行：任务 1", "Plot Planner");
        }
    }

    function moveTask(offset) {
        if (currentTasks.length === 0) return;
        const nextIndex = Math.max(0, Math.min(currentTasks.length - 1, activeTaskIndex + offset));
        if (nextIndex === activeTaskIndex) return;
        if (currentTasks[activeTaskIndex]) currentTasks[activeTaskIndex].status = 'pending';
        activeTaskIndex = nextIndex;
        currentTasks[activeTaskIndex].status = 'active';
        isExecutionPaused = false;
        updatePauseButton();
        renderTasks();
        updatePromptInjection();
        savePlannerState();
    }

    function completeCurrentTask(status = 'completed') {
        if (activeTaskIndex < 0 || activeTaskIndex >= currentTasks.length) return;
        currentTasks[activeTaskIndex].status = status === 'skipped' ? 'skipped' : 'completed';
        const completedNumber = activeTaskIndex + 1;
        activeTaskIndex++;

        if (activeTaskIndex < currentTasks.length) {
            currentTasks[activeTaskIndex].status = 'active';
            notify('success', `任务 ${completedNumber} 已${status === 'skipped' ? '跳过' : '完成'}，已进入下一节点。`);
        } else {
            activeTaskIndex = -1;
            notify('info', '所有剧情节点已结束。');
        }
        renderTasks();
        updatePromptInjection();
        savePlannerState();
    }

    function toggleExecutionPause() {
        isExecutionPaused = !isExecutionPaused;
        updatePauseButton();
        updatePromptInjection();
        savePlannerState();
    }

    function updatePauseButton() {
        $('#plot-planner-pause').text(isExecutionPaused ? '继续' : '暂停');
    }

    function stopExecution() {
        activeTaskIndex = -1;
        isExecutionPaused = false;
        currentTasks.forEach(task => {
            if (task.status === 'active') task.status = 'pending';
        });
        updatePauseButton();
        renderTasks();
        updatePromptInjection();
        savePlannerState();
        notify('info', '剧情规划已停止，任务清单仍保留。');
    }

    function clearPlanner() {
        currentDraft = '';
        miniChatHistory = [];
        currentTasks = [];
        activeTaskIndex = -1;
        isExecutionPaused = false;
        lastFailedAction = null;

        $('#plot-planner-chat-history').empty().append(
            $('<div>').addClass('chat-message system-msg').text('请在上方输入设定并点击"生成草案"，AI将为你构思带转折的剧情大纲。')
        );
        $('#plot-planner-chat-input').val('');
        $('#plot-planner-chat-input, #plot-planner-chat-send, #plot-planner-breakdown').prop('disabled', true);
        $('#plot-planner-error').hide();
        $('#plot-planner-execution-area').slideUp();
        $('#plot-planner-chat-section').slideDown();
        $('#plot-planner-start').hide();
        $('#plot-planner-breakdown').show();
        updatePauseButton();
        renderTasks();
        updatePromptInjection();
        savePlannerState();
        notify('info', '已清空剧情规划和任务链，可重新生成或切换任务。');
    }

    function onMessageReceived(messageId) {
        if (isExecutionPaused) return;
        if (activeTaskIndex < 0 || activeTaskIndex >= currentTasks.length) return;

        const context = SillyTavern.getContext();
        const message = context?.chat?.[Number(messageId)];
        if (!message || message.is_user || !message.mes) return;
        consumeCompletionTag(message);
    }

    function consumeCompletionTag(message) {
        if (!COMPLETION_TAG_REGEX.test(message.mes || '')) return false;
        completeCurrentTask('completed');
        return true;
    }

    // ===== 启动 =====
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 300);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
    }

})();
