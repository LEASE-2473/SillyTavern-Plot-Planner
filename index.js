// ========================================================================
// 剧情规划器 (Plot Planner) v2.0.0
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

    console.log('🗺️ 剧情规划器 v2.0.0 启动');

    // ===== 内部状态 =====
    let isModalOpen = false;
    let currentTasks = [];
    let activeTaskIndex = -1;
    let miniChatHistory = [];
    let currentDraft = '';
    let isExecutionPaused = false;
    let isJudgingCompletion = false;
    let activeRequest = null;
    let lastFailedAction = null;
    
    // 多配置与预设
    let apiProfiles = [];
    let currentProfileId = 'default';
    let builtInPrompts = [];
    let customPrompts = [];

    const STATE_KEY = 'plot_planner_state';
    const REQUEST_TIMEOUT_MS = 90000;
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
            <details class="plot-planner-details" id="plot-planner-settings-details">
                <summary>⚙️ 剧情与 API 高级设置 (点击展开/折叠)</summary>
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
                            <label>预设模板 (Prompt):</label>
                            <select id="plot-planner-prompt-template" style="flex:1;">
                                <option value="custom">-- 自定义 --</option>
                            </select>
                            <button id="plot-planner-prompt-save" class="plot-btn success-btn" style="margin-left: 5px;">➕ 保存为自定义</button>
                            <button id="plot-planner-prompt-del" class="plot-btn warning-btn" style="margin-left: 5px; display:none;">🗑️</button>
                        </div>
                        <div class="config-row" style="align-items: flex-start; margin-top: 5px;">
                            <label>系统提示词:</label>
                            <textarea id="plot-planner-system-prompt" style="flex:1; height: 80px; background: #121215; border: 1px solid #333; color: #fff; padding: 8px; border-radius: 4px; resize: vertical;" placeholder="在此输入自定义的大模型系统提示词，可包含破限指令。"></textarea>
                        </div>
                    </div>

                    <!-- 剧情参数 -->
                    <div class="plot-planner-config" id="plot-planner-config-section">
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
                    <label class="auto-judge-toggle"><input id="plot-planner-auto-judge" type="checkbox" checked> 自动判定完成</label>
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
        $('#plot-planner-retry').on('click', retryLastAction);
        $('#plot-planner-cancel-request').on('click', cancelActiveRequest);
        $('#plot-planner-auto-judge, #plot-context-chat, #plot-context-character, #plot-context-note, #plot-context-world, #plot-context-count')
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
                    systemPrompt: builtInPrompts.find(p=>p.id==='default_safe')?.prompt || ""
                }];
            }
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
        $('#plot-planner-system-prompt').val(p.systemPrompt || '');
        onTemplateChange();
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
            systemPrompt: builtInPrompts.find(p=>p.id==='default_safe')?.prompt || ""
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
            autoJudge: $('#plot-planner-auto-judge').prop('checked'),
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
        $('#plot-planner-auto-judge').prop('checked', state?.autoJudge !== false);

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
            completionCriteria: String(task?.completionCriteria || ''),
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
        let systemPrompt = $('#plot-planner-system-prompt').val().trim();
        if (!systemPrompt) systemPrompt = "你是一个专业的 RPG 跑团向剧情策划大师。请构思剧情大纲或任务拆解。不要输出不相关的废话。";

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
        return JSON.parse(cleaned);
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

            let prompt = `请基于以下剧情上下文，为接下来的剧情生成可继续商讨的大纲草案。\n\n${plotContext.text || '【剧情上下文】无'}\n\n`;
            if (direction) prompt += `【玩家要求的方向或结局】\n${direction}\n\n`;
            prompt += `请规划大约 ${nodeCount} 个阶段。说明每个阶段的目标、冲突、转折和与既有设定的联系，但暂时不要输出 JSON。`;

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

【当前大纲】
${currentDraft}

【最近商讨】
${recentDiscussion}

【本轮修改意见】
${text}`;
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
            const prompt = `将以下剧情大纲拆解成严格按顺序执行的任务。每个任务包含：
1. title：简短标题；
2. summary：该节点应发生的剧情；
3. completionCriteria：可以从角色回复中客观判断的完成条件。

只输出符合指定 JSON Schema 的结果。

【剧情大纲】
${currentDraft}`;
            const response = await callStructuredLLM(prompt, TASK_SCHEMA, { temperature: 0.3 });
            const parsed = parseJsonResponse(response);
            if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
                throw new Error('模型没有返回有效任务');
            }
            currentTasks = parsed.tasks.map(task => ({
                title: String(task.title || '').trim(),
                summary: String(task.summary || '').trim(),
                completionCriteria: String(task.completionCriteria || '').trim(),
                status: 'pending'
            }));
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
当前剧情节点：${currentTask.title}
节点内容：${currentTask.summary}
完成条件：${currentTask.completionCriteria}
请在接下来的对话中自然地推动该节点，不要跳过必要过程，也不要提及剧情规划器。]`;
            
            // IN_CHAT at depth 0, system role.
            context.setExtensionPrompt('plot-planner', injectionText, 1, 0);
            console.log("[PlotPlanner] 已更新任务提示词:", currentTask.title);
        } else {
            context.setExtensionPrompt('plot-planner', '', 1, 0);
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

    async function onMessageReceived(messageId) {
        if (isExecutionPaused || isJudgingCompletion) return;
        if (!$('#plot-planner-auto-judge').prop('checked')) return;
        if (activeTaskIndex < 0 || activeTaskIndex >= currentTasks.length) return;

        const context = SillyTavern.getContext();
        const message = context?.chat?.[Number(messageId)];
        if (!message || message.is_user || !message.mes) return;
        await judgeTaskCompletion(message.mes);
    }

    async function judgeTaskCompletion(messageText) {
        const taskIndexAtStart = activeTaskIndex;
        const task = currentTasks[taskIndexAtStart];
        if (!task) return;
        isJudgingCompletion = true;
        try {
            const judgeSchema = {
                name: 'plot_task_completion',
                strict: true,
                value: {
                    type: 'object',
                    properties: {
                        complete: { type: 'boolean' },
                        confidence: { type: 'number' },
                        reason: { type: 'string' }
                    },
                    required: ['complete', 'confidence', 'reason'],
                    additionalProperties: false
                }
            };
            const prompt = `判断最新角色回复是否已经满足当前剧情节点的完成条件。只能依据回复中实际发生的内容，不要因为提到了未来计划就判定完成。

【当前节点】
${task.title}
${task.summary}

【完成条件】
${task.completionCriteria}

【最新角色回复】
${messageText}

返回 JSON。confidence 范围为 0 到 1。`;
            const result = parseJsonResponse(await callStructuredLLM(prompt, judgeSchema, {
                temperature: 0.1,
                responseLength: 256
            }));
            if (activeTaskIndex === taskIndexAtStart && result.complete === true && Number(result.confidence) >= 0.75) {
                completeCurrentTask('completed');
            } else if (result.reason) {
                console.info('[PlotPlanner] 当前任务尚未完成:', result.reason);
            }
        } catch (error) {
            console.warn('[PlotPlanner] 自动完成判定失败:', error);
            notify('warning', '自动完成判定失败，可稍后手动完成任务。');
        } finally {
            isJudgingCompletion = false;
        }
    }

    // ===== 启动 =====
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 300);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
    }

})();
