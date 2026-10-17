// 直连大模型接口（OpenAI 兼容 /chat/completions）—— 手机浏览器里跑，不经过任何服务器
// ⭐ key 只存在【手机 localStorage】，公开页面上永远没有 key
// ⭐ 不传 response_format —— 各家兼容度不一，靠提示词 + 宽容解析（_parse_json）就够了
(function () {
  // CORS 实测（2026-10-17，带 Origin 头打的预检）：以下五家都回了 Access-Control-Allow-Origin ✅
  const PROVIDERS = [
    { id: 'deepseek', label: 'DeepSeek（便宜，推荐）', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'zhipu',    label: '智谱 GLM（有免费额度）', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { id: 'dashscope',label: '通义千问（阿里云）',     base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { id: 'moonshot', label: 'Kimi（月之暗面）',       base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { id: 'ark',      label: '火山方舟（模型名要填接入点）', base: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
    { id: 'custom',   label: '其他 / 公司内网接口',     base: '', model: '' },
  ];
  const KEY_STORE = 'chutuzhi.llm.v1';

  function getCfg() {
    try {
      const raw = localStorage.getItem(KEY_STORE);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || !o.base || !o.model || !o.key) return null;
      return o;
    } catch (e) { return null; }
  }
  function setCfg(o) { localStorage.setItem(KEY_STORE, JSON.stringify(o)); }
  function clearCfg() { localStorage.removeItem(KEY_STORE); }

  /** 把异常翻成人话 —— 老师傅看得懂的那种 */
  function _explain(e, status) {
    if (status === 401 || status === 403) return `密钥不对或没权限（HTTP ${status}）—— 重新填一次 key`;
    if (status === 402) return '这个账号没钱了（HTTP 402）—— 去后台充值或者换一家';
    if (status === 404) return '模型名或接口地址不对（HTTP 404）—— 检查「模型」那一栏';
    if (status === 429) return '请求太频繁 / 额度用完了（HTTP 429）—— 等一会儿再试';
    if (status >= 500) return `对方服务器出问题了（HTTP ${status}）—— 过会儿再试`;
    const s = String((e && e.message) || e || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(s)) {
      return '连不上这个接口（网络断了，或者这家不允许网页直接调）—— 换一家试试';
    }
    if (/abort/i.test(s)) return '等太久了，超时 —— 再试一次';
    return s || '不知道哪儿出错了';
  }

  /**
   * 调一次，返回解析好的 JSON 对象。
   * @param {{system:string, user:string|Array, timeoutMs?:number}} p
   */
  async function chatJSON(p) {
    const cfg = getCfg();
    if (!cfg) { const e = new Error('还没设置接口密钥'); e.needSetup = true; throw e; }

    const msgs = [];
    if (p.system) msgs.push({ role: 'system', content: p.system });
    if (Array.isArray(p.user)) msgs.push(...p.user);
    else msgs.push({ role: 'user', content: p.user });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), p.timeoutMs || 90000);
    let resp;
    try {
      resp = await fetch(cfg.base.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify({
          model: cfg.model,
          messages: msgs,
          temperature: p.temperature === undefined ? 0.2 : p.temperature,
          stream: false,
        }),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const err = new Error(_explain(e, 0)); err.raw = e; throw err;
    }
    clearTimeout(timer);

    if (!resp.ok) {
      let extra = '';
      try { const t = await resp.text(); extra = t.slice(0, 300); } catch (_) {}
      const err = new Error(_explain(null, resp.status));
      err.status = resp.status; err.body = extra; throw err;
    }

    let data;
    try { data = await resp.json(); } catch (e) {
      throw new Error('接口返回的不是 JSON —— 可能地址填成了网页首页');
    }
    let txt = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    if (Array.isArray(txt)) txt = txt.map((b) => (b && b.text) || '').join('');
    return _parseJSON(txt);
  }

  /** 容错解析：剥 ```json 围栏、截首尾大括号（agent.py:177 _parse_json） */
  function _parseJSON(text) {
    let s = String(text == null ? '' : text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
    try {
      return JSON.parse(s);
    } catch (e) {
      throw new Error('模型回的话不是 JSON（' + s.slice(0, 80) + '…）');
    }
  }

  /** 验一下 key 能不能用 —— 花最少 token */
  async function ping() {
    const r = await chatJSON({
      system: '只输出 JSON：{"ok":true}',
      user: '回 {"ok":true}',
      timeoutMs: 30000,
    });
    return r;
  }

  window.LLM = { PROVIDERS, getCfg, setCfg, clearCfg, chatJSON, ping, _parseJSON };
})();
