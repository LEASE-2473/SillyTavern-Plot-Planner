// ========================================================================
// 剧情规划器 (Plot Planner) v1.1.0
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

    console.log('🗺️ 剧情规划器 v1.1.0 启动');

    // ===== 内部状态 =====
    let isModalOpen = false;
    let currentTasks = [];
    let activeTaskIndex = -1;
    let miniChatHistory = [];
    
    // 多配置与预设
    let apiProfiles = [];
    let currentProfileId = 'default';
    let builtInPrompts = [];
    let customPrompts = [];

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
                <div id="plot-planner-tasks-list" class="tasks-list"></div>
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
            }
        } catch (e) {
            console.error('❌ [PlotPlanner] 注册事件监听失败:', e);
        }
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

    // ===== 调用 LLM =====
    async function callLLM(promptText) {
        const mode = $('#plot-planner-api-mode').val();
        let systemPrompt = $('#plot-planner-system-prompt').val().trim();
        if (!systemPrompt) systemPrompt = "你是一个专业的 RPG 跑团向剧情策划大师。请构思剧情大纲或任务拆解。不要输出不相关的废话。";
        
        try {
            console.log("[PlotPlanner] 发送给大模型的 Prompt (模式: " + mode + ")");
            
            if (mode === 'custom') {
                const url = $('#plot-planner-api-url').val().trim();
                const key = $('#plot-planner-api-key').val().trim();
                const model = $('#plot-planner-api-model').is(':visible') ? $('#plot-planner-api-model').val().trim() : $('#plot-planner-api-model-select').val();
                
                if (!url) throw new Error("独立 API URL 未配置，请填写完整 API 地址");
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`
                    },
                    body: JSON.stringify({
                        model: model || 'gpt-3.5-turbo',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: promptText }
                        ],
                        temperature: 0.7
                    })
                });
                
                if (!response.ok) throw new Error(`HTTP 错误 ${response.status}`);
                const data = await response.json();
                return data.choices?.[0]?.message?.content || "模型返回了异常结构结果。";
                
            } else {
                const context = SillyTavern.getContext();
                if (!context || typeof context.generateRaw !== 'function') {
                    throw new Error("SillyTavern API 不可用。请确保已连接大模型。");
                }
                
                let response;
                try {
                    response = await context.generateRaw({ prompt: promptText, systemPrompt: systemPrompt });
                } catch (err) {
                    console.warn("[PlotPlanner] 对象式调用 generateRaw 失败，降级为字符串参数调用...", err);
                    // 兼容旧版纯字符串参数
                    response = await context.generateRaw(`${systemPrompt}\n\n${promptText}`);
                }
                return response || "模型返回了空结果。";
            }
        } catch (e) {
            console.error(e);
            return "生成失败，请检查模型连接：" + (e.message || e);
        }
    }

    // ===== 阶段1: 生成草案 =====
    async function handleGenerateDraft() {
        saveCurrentProfile(); // 点击生成时自动保存一下当前配置
        const direction = $('#plot-planner-direction').val();
        const nodeCount = $('#plot-planner-node-count').val();

        let lastMessages = '';
        try {
            const context = SillyTavern.getContext();
            if (context && context.chat) {
                lastMessages = context.chat.slice(-20).map(m => `${m.name}: ${m.mes}`).join('\n');
            }
        } catch (e) {
            console.warn('[PlotPlanner] 读取聊天记录失败:', e);
        }

        let prompt = `你是一个剧情规划助手。请阅读以下最近的聊天记录，并为接下来的剧情生成一个大纲草案。\n\n【最近聊天记录】\n${lastMessages}\n\n`;
        if (direction) {
            prompt += `玩家要求的剧情方向/结局是：${direction}\n`;
        }
        prompt += `请生成一个大概包含 ${nodeCount} 个阶段的剧情大纲，每个阶段要有简短的核心冲突或转折。`;

        $('#plot-planner-generate-draft').prop('disabled', true).text('生成中...');
        const response = await callLLM(prompt);
        $('#plot-planner-generate-draft').prop('disabled', false).text('重新生成草案');

        appendMiniChat('ai', response);
        miniChatHistory.push({ role: 'ai', content: response });

        $('#plot-planner-chat-input').prop('disabled', false);
        $('#plot-planner-chat-send').prop('disabled', false);
        $('#plot-planner-breakdown').prop('disabled', false);
    }

    // ===== 商讨消息 =====
    async function handleChatSend() {
        const text = $('#plot-planner-chat-input').val().trim();
        if (!text) return;

        $('#plot-planner-chat-input').val('');
        appendMiniChat('user', text);
        miniChatHistory.push({ role: 'user', content: text });

        $('#plot-planner-chat-send').prop('disabled', true);
        let prompt = "根据我们之前的商讨，玩家提出了新的修改意见：\n" + text + "\n请根据意见修改剧情大纲并返回最新的版本。";
        const response = await callLLM(prompt);
        appendMiniChat('ai', response);
        miniChatHistory.push({ role: 'ai', content: response });
        $('#plot-planner-chat-send').prop('disabled', false);
    }

    // ===== 阶段2: 拆解任务 =====
    async function handleBreakdown() {
        $('#plot-planner-breakdown').prop('disabled', true).text('拆解中...');
        
        const lastDraft = miniChatHistory.length > 0 ? miniChatHistory[miniChatHistory.length - 1].content : "无大纲";
        const prompt = "请将以下剧情大纲严格拆解成按顺序执行的子任务节点。每个任务必须简短且高度概括。每一行必须以 'Step X:' 开头（X是数字）。\n\n【剧情大纲】\n" + lastDraft;
        
        const response = await callLLM(prompt);
        
        // 解析 Step
        const lines = response.split('\n');
        currentTasks = lines.filter(line => line.toLowerCase().includes('step')).map(line => line.trim());
        
        if (currentTasks.length === 0) {
            currentTasks = [
                "Step 1: 解析失败，未发现带 'Step' 的内容",
                "Step 2: 请手动在此编辑具体任务内容"
            ];
        }

        renderTasks();

        $('#plot-planner-settings-details').removeAttr('open');
        $('#plot-planner-chat-section').slideUp();
        $('#plot-planner-execution-area').slideDown();
        $('#plot-planner-start').show();
        $('#plot-planner-breakdown').hide();
    }

    function renderTasks() {
        const list = $('#plot-planner-tasks-list');
        list.empty();

        currentTasks.forEach((task, index) => {
            const isActive = index === activeTaskIndex ? 'active' : '';
            const isCompleted = index < activeTaskIndex ? 'completed' : '';

            const itemDiv = $('<div>').addClass(`task-item ${isActive} ${isCompleted}`);
            const headerDiv = $('<div>').addClass('task-header');
            
            headerDiv.append($('<span>').text(`子任务 ${index + 1}`));
            if (index === activeTaskIndex) headerDiv.append($('<span>').text('(当前进行中)'));
            if (index < activeTaskIndex) headerDiv.append($('<span>').text('(已完成 ✓)'));
            
            const textarea = $('<textarea>').addClass('task-content').data('index', index).val(task);
            
            itemDiv.append(headerDiv).append(textarea);
            list.append(itemDiv);
        });

        $('.task-content').on('change', function () {
            const idx = $(this).data('index');
            currentTasks[idx] = $(this).val();
        });
    }

    // ===== 注入与清理 Prompt =====
    function updatePromptInjection() {
        const context = SillyTavern.getContext();
        if (!context || typeof context.setExtensionPrompt !== 'function') return;

        if (activeTaskIndex >= 0 && activeTaskIndex < currentTasks.length) {
            const currentTask = currentTasks[activeTaskIndex];
            const injectionText = `[System Note (Plot Planner): \n当前的主线任务/剧情节点是：${currentTask}\n请在接下来的对话中，自然地引导剧情向这个方向发展。不要一次性跳到结局。\n当且仅当这个剧情节点彻底发生并结束时，请在回复的最后加上隐藏标记：<QuestComplete> ]`;
            
            // 参数: id, text, position(1=IN_PROMPT), depth(0)
            context.setExtensionPrompt('plot-planner', injectionText, 1, 0);
            console.log("[PlotPlanner] 已注入任务提示词:", currentTask);
        } else {
            context.setExtensionPrompt('plot-planner', '', 1, 0);
            console.log("[PlotPlanner] 已清除任务提示词");
        }
    }

    // ===== 正式启动 =====
    function handleStartExecution() {
        activeTaskIndex = 0;
        renderTasks();
        toggleModal();
        updatePromptInjection();
        if (typeof toastr !== 'undefined') {
            toastr.success("🗺️ 剧情规划已启动！当前执行：任务 1", "Plot Planner");
        }
    }

    // ===== 消息拦截 =====
    function onMessageReceived(messageId) {
        if (activeTaskIndex === -1 || activeTaskIndex >= currentTasks.length) return;

        try {
            const context = SillyTavern.getContext();
            if (!context || !context.chat) return;

            const lastMsg = context.chat[context.chat.length - 1];
            if (lastMsg && !lastMsg.is_user && lastMsg.mes && lastMsg.mes.includes('<QuestComplete>')) {
                // 删除数据层的标签
                lastMsg.mes = lastMsg.mes.replace(/<QuestComplete>/gi, '').trim();
                
                // 删除 UI DOM 层的标签
                const msgEl = $('.mes_text').last();
                if (msgEl.length > 0) {
                    msgEl.html(msgEl.html().replace(/&lt;QuestComplete&gt;|<QuestComplete>/gi, ''));
                }
                
                if (typeof context.saveChat === 'function') {
                    context.saveChat();
                }

                activeTaskIndex++;
                renderTasks();
                updatePromptInjection();

                if (activeTaskIndex < currentTasks.length) {
                    if (typeof toastr !== 'undefined') {
                        toastr.success(`✅ 任务 ${activeTaskIndex} 已完成！推进到下一个任务。`, "Plot Planner");
                    }
                } else {
                    if (typeof toastr !== 'undefined') {
                        toastr.info("🎉 所有剧情节点已完成！", "Plot Planner");
                    }
                    activeTaskIndex = -1;
                    updatePromptInjection();
                }
            }
        } catch (e) {
            console.error('[PlotPlanner] 消息拦截出错:', e);
        }
    }

    // ===== 启动 =====
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 300);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
    }

})();
