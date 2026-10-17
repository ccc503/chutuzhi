// 手机聊天版的前端逻辑（纯逻辑，样式在 index.html）
// 数据存 localStorage：{ convs:[{id,title,msgs:[...]}], cur } —— ⚠️ 只存 spec，不存 SVG
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const STORE = 'chutuzhi.convs.v2';
  let S = { convs: [], cur: null };

  // ══════════════════ 存储 ══════════════════
  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.convs)) S = o;
      }
    } catch (e) { /* 坏了就当空的 */ }
    if (!S.convs.length) newConv(true);
    if (!S.convs.some((c) => c.id === S.cur)) S.cur = S.convs[0].id;
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); }
    catch (e) { /* 满了就先不管，别崩 */ }
  }
  function curConv() { return S.convs.find((c) => c.id === S.cur) || S.convs[0]; }
  function newConv(silent) {
    const c = { id: 'c' + Date.now().toString(36), title: '新对话', msgs: [] };
    S.convs.unshift(c);
    S.cur = c.id;
    if (!silent) { save(); renderAll(); }
    return c;
  }

  // ══════════════════ 消息渲染 ══════════════════
  function svgOf(rec) {
    if (rec.svg) return rec.svg;
    // 从 spec 本地重画（切回来 / 刷新时用，不调模型）
    try {
      const spec = Object.assign({}, rec.spec || {});
      spec.name = rec.name;
      const r = window.RENDERER.render(rec.kind, spec, rec.name);
      if (r.ok) { rec.svg = r.svg; rec.html = r.html; rec.problems = r.problems; return r.svg; }
      return '';
    } catch (e) { return ''; }
  }

  function schemeCard(rec, mi, ri) {
    const svg = svgOf(rec) || '';
    const bad = (rec.problems || []).filter((p) => p && !String(p).startsWith('压字'));
    const warnBadge = bad.length
      ? `<span class="bg bg-bad">⚠️ 自检 ${bad.length}</span>` : `<span class="bg bg-ok">自检通过</span>`;
    const srcBadge = rec.source === 'library'
      ? `<span class="bg bg-lib">库里的做法</span>` : `<span class="bg bg-ai">大模型想的</span>`;
    const basis = (rec.basis || []).length
      ? `<div class="basis">依据：${esc(rec.basis.slice(0, 4).join('、'))}</div>` : '';
    const warn = (rec.warn || []).length
      ? `<div class="warn">${esc(rec.warn.join('；'))}</div>` : '';
    return `
      <div class="card" data-mi="${mi}" data-ri="${ri}">
        <div class="card-hd">
          <span class="card-n">${rec.n}</span>
          <span class="card-name">${esc(rec.name)}</span>
        </div>
        <div class="thumb" data-act="open">${svg || '<div class="thumb-miss">图没出来</div>'}</div>
        <div class="badges">${srcBadge}${warnBadge}<span class="bg bg-dim">${esc(kindLabel(rec.kind))}</span></div>
        ${rec.why ? `<div class="why">为什么：${esc(rec.why)}</div>` : ''}
        ${rec.assume ? `<div class="assume">我假设：${esc(rec.assume)}</div>` : ''}
        ${basis}${warn}
        <div class="card-ft">
          <button class="btn-s" data-act="open">看大图</button>
          <button class="btn-s" data-act="print">存 PDF</button>
          <button class="btn-s" data-act="fix">按这个改</button>
          <button class="btn-s btn-good" data-act="pick">就它了</button>
        </div>
      </div>`;
  }

  function kindLabel(k) {
    return ({
      tank: '通用电控柜', real_cabinet: '实物样板柜', stardelta: '星三角',
      vfd: '变频柜', refrig: '制冷柜', purifier: '油烟净化',
    })[k] || k;
  }

  function msgHtml(m, mi) {
    if (m.role === 'user') {
      return `<div class="row row-u"><div class="bub bub-u">${esc(m.content)}</div></div>`;
    }
    if (m.thinking) {
      return `<div class="row row-a"><div class="bub bub-a thinking">
        <span class="spin"></span><span class="th-txt">${esc(m.step || '想一下…')}</span></div></div>`;
    }
    if (m.error) {
      return `<div class="row row-a"><div class="bub bub-a err">${esc(m.error)}</div></div>`;
    }
    const r = m.result || {};
    if (r.kind === 'cannot') {
      return `<div class="row row-a"><div class="bub bub-a cannot">${esc(r.reply).replace(/\n/g, '<br>')}</div></div>`;
    }
    const cards = (r.recommendations || []).map((rec, ri) => schemeCard(rec, mi, ri)).join('');
    const chips = (r.nextQuestions || []).map((q) =>
      `<button class="chip-q" data-act="chip" data-q="${esc(q.key + '：' + q.options[0])}">${esc(q.key)}？</button>`
    ).join('');
    return `<div class="row row-a"><div class="ans">
      <div class="bub bub-a">${esc(r.reply).replace(/\n/g, '<br>')}</div>
      ${r.notice ? `<div class="notice">${esc(r.notice)}</div>` : ''}
      <div class="cards">${cards}</div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      <div class="meta">用了 ${r.ms || 0} ms · ${(r.trace && r.trace.steps || []).length} 步</div>
    </div></div>`;
  }

  function renderAll() {
    const c = curConv();
    const box = $('#msgs');
    if (!c.msgs.length) {
      box.innerHTML = heroHtml();
    } else {
      box.innerHTML = c.msgs.map((m, i) => msgHtml(m, i)).join('');
    }
    box.scrollTop = box.scrollHeight;
    $('#title').textContent = c.title || '出图纸';
    $('#convCount').textContent = S.convs.length > 1 ? String(S.convs.length) : '';
    const cfg = window.LLM.getCfg();
    $('#cfgDot').className = 'dot ' + (cfg ? 'dot-ok' : 'dot-bad');
  }

  function heroHtml() {
    const cfg = window.LLM.getCfg();
    const need = !cfg;
    return `<div class="hero">
      <div class="hero-t">出图纸</div>
      <div class="hero-s">一句话说你要什么柜子，我给你画出来</div>
      ${need ? `<button class="btn-setup" data-act="setup">① 先填一下 AI 接口（只填一次）</button>` : ''}
      <div class="ex">比方说：</div>
      <div class="ex-list">
        <button class="ex-item" data-act="say" data-q="做个 4 台水泵轮流启动的柜子">做个 4 台水泵轮流启动的柜子</button>
        <button class="ex-item" data-act="say" data-q="2 路加热带加 1 个循环泵，要温控和液位">2 路加热 + 1 个循环泵，要温控和液位</button>
        <button class="ex-item" data-act="say" data-q="给冷库做个电控柜，4 度左右">给冷库做个电控柜</button>
        <button class="ex-item" data-act="say" data-q="11 千瓦电机要星三角启动">11kW 电机星三角启动</button>
      </div>
      <div class="hero-ft">${cfg ? '接口已配好 ✅' : '没配接口也能用，但只能用库里的标准做法'}</div>
    </div>`;
  }

  // ══════════════════ 发送 ══════════════════
  let busy = false;

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    const c = curConv();
    c.msgs.push({ role: 'user', content: text });
    if (c.title === '新对话') c.title = text.slice(0, 14);
    const aiMsg = { role: 'assistant', thinking: true, step: '想一下…' };
    c.msgs.push(aiMsg);
    save(); renderAll();
    busy = true;
    $('#send').disabled = true;

    const history = c.msgs.slice(0, -2).map((m) => ({
      role: m.role, content: m.role === 'user' ? m.content : ((m.result && m.result.reply) || ''),
    })).filter((m) => m.content);

    try {
      const result = await window.AGENT.recommend(text, {
        n: 3, history,
        onStep: (s) => {
          const live = curConv().msgs.find((m) => m === aiMsg);
          if (live) { live.step = s; const el = $('#msgs .thinking .th-txt'); if (el) el.textContent = s; }
        },
      });
      // ⚠️ 只留 spec，把 svg/html 丢掉再存（localStorage 有限）
      const slim = JSON.parse(JSON.stringify({
        kind: result.kind, reply: result.reply, capability: result.capability,
        understanding: result.understanding, isVague: result.isVague,
        count: result.count, nextQuestions: result.nextQuestions,
        trace: result.trace, llmError: result.llmError, notice: result.notice, ms: result.ms,
        recommendations: (result.recommendations || []).map((r) => ({
          n: r.n, kind: r.kind, name: r.name, why: r.why, assume: r.assume,
          loads: r.loads, ctrls: r.ctrls, has_level: r.has_level, has_temp: r.has_temp,
          has_lamp: r.has_lamp, phases: r.phases, kw: r.kw, fan_kw: r.fan_kw,
          picks: r.picks, source: r.source, basis: r.basis, warn: r.warn,
          renderOk: r.renderOk, problems: r.problems, spec: r.spec,
          chars: r.chars, elements: r.elements,
        })),
      }));
      Object.assign(aiMsg, { thinking: false, result, slim });
      delete aiMsg.step;
      aiMsg.slim = slim;
    } catch (e) {
      Object.assign(aiMsg, {
        thinking: false,
        error: (e && e.needSetup)
          ? '还没填 AI 接口 —— 点右上角 ⚙️ 填一下（只填一次）'
          : ('出错了：' + String((e && e.message) || e)),
      });
    } finally {
      busy = false;
      $('#send').disabled = false;
      save(); renderAll();
    }
  }

  // ══════════════════ 大图查看器 ══════════════════
  let viewerRec = null;
  function openViewer(rec) {
    viewerRec = rec;
    const ov = $('#viewer');
    const svg = svgOf(rec);
    $('#vTitle').textContent = rec.name || '';
    $('#vBody').innerHTML = svg || '<div class="thumb-miss">图没出来</div>';
    $('#vBadges').innerHTML = (rec.problems || []).length
      ? `<span class="bg bg-bad">⚠️ 自检：${esc((rec.problems || []).slice(0, 3).join('；'))}</span>`
      : '<span class="bg bg-ok">自检通过：无断线 / 无短路 / 无超界</span>';
    $('#vBody').scrollLeft = 0; $('#vBody').scrollTop = 0;
    ov.classList.add('on');
  }
  function closeViewer() { $('#viewer').classList.remove('on'); viewerRec = null; }

  /* ⭐ 存 PDF：把这张图的单页 HTML 塞进隐藏 iframe，调它的 print() ——
     浏览器打印对话框里「目标打印机」选成「另存为 PDF」，存出来就是矢量 PDF。
     ⚠️ 不用 jsPDF / svg2pdf 这类库：SVG 转 canvas 是位图，图纸放大就糊。
     那份 HTML 自带 @page{size:A3 landscape;margin:6mm} → 出来就是 A3 横向单页。
     ⚠️ iframe 必须挂进 document 才能拿到完整排版上下文，否则 print() 打出来是空白。*/
  function savePdf(rec) {
    const svg = svgOf(rec);
    const html = rec.html || (svg ? `<!doctype html><meta charset="utf-8"><title>${esc(rec.name || '出图纸')}</title>${svg}` : '');
    if (!html) { alert('图没出来'); return; }
    let f = document.getElementById('pdframe');
    if (f) f.remove();
    f = document.createElement('iframe');
    f.id = 'pdframe';
    f.setAttribute('title', rec.name || '出图纸');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;'
                    + 'opacity:0;border:0;pointer-events:none;';
    document.body.appendChild(f);
    try {
      const d = f.contentDocument || f.contentWindow.document;
      d.open(); d.write(html); d.close();
    } catch (e) { alert('这张图打不开：' + e); return; }
    // 等它排完版再打印 —— 立刻 print 会打到空白页
    setTimeout(() => {
      try {
        f.contentWindow.focus();
        f.contentWindow.print();
      } catch (e) { alert('打不开打印窗口：' + e); }
    }, 500);
  }

  // ══════════════════ 设置面板 ══════════════════
  function openSetup() {
    const cfg = window.LLM.getCfg() || {};
    const sel = $('#pSel');
    if (!sel.options.length) {
      sel.innerHTML = window.LLM.PROVIDERS
        .map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
    }
    const pid = cfg.providerId || window.LLM.PROVIDERS[0].id;
    sel.value = pid;
    const p = window.LLM.PROVIDERS.find((x) => x.id === pid) || window.LLM.PROVIDERS[0];
    $('#pBase').value = cfg.base || p.base;
    $('#pModel').value = cfg.model || p.model;
    $('#pKey').value = cfg.key || '';
    $('#pMsg').textContent = '';
    $('#setup').classList.add('on');
  }
  function closeSetup() { $('#setup').classList.remove('on'); }

  async function testKey() {
    const btn = $('#pTest');
    const msg = $('#pMsg');
    btn.disabled = true;
    msg.className = 'p-msg';
    msg.textContent = '正在试…';
    try {
      window.LLM.setCfg({
        providerId: $('#pSel').value,
        base: $('#pBase').value.trim(),
        model: $('#pModel').value.trim(),
        key: $('#pKey').value.trim(),
      });
      await window.LLM.ping();
      msg.className = 'p-msg ok';
      msg.textContent = '✅ 能用！可以关掉这个窗口开始画了';
    } catch (e) {
      msg.className = 'p-msg bad';
      msg.textContent = '❌ ' + String((e && e.message) || e);
    } finally {
      btn.disabled = false;
      renderAll();
    }
  }

  // ══════════════════ 左侧边栏 ══════════════════
  // ⚠️ 2026-10-17 用户反馈「侧边栏没有了，跟之前不是一个样的」。
  //    手机版第一版只做了个「所有对话」弹窗，把电脑版那个「这里能画什么」的侧栏整个丢了。
  //    现在补回来：手机上从左滑出，大屏常驻；内容与 cad-agent/web/index.html 的 renderSide() 对齐。
  const FSKEY = 'chutuzhi.fs';
  let FS = 1;

  function applyFs() {
    document.body.classList.remove('fs-2', 'fs-3');
    if (FS === 2) document.body.classList.add('fs-2');
    if (FS === 3) document.body.classList.add('fs-3');
    $$('.fsbtn').forEach((b) => b.classList.toggle('on', +b.dataset.fs === FS));
  }

  function openSide() {
    renderSide();
    $('#side').classList.add('on');
    $('#veil').classList.add('on');
  }
  function closeSide() {
    $('#side').classList.remove('on');
    $('#veil').classList.remove('on');
  }

  function convosNode() {
    if (!S.convs.length) return '<div class="empty">还没有对话。<br>点下面「开个新对话」。</div>';
    return '<div class="clist">' + S.convs.map((c) => {
      const on = c.id === S.cur;
      const nu = c.msgs.filter((m) => m.role === 'user').length;
      const nf = c.msgs.filter((m) => m.role === 'ai').reduce(
        (s, m) => s + (((m.result && m.result.recommendations) || [])
          .filter((r) => r && (r.svg || r.kind)).length), 0);
      return `<div class="citem${on ? ' on' : ''}" data-act="conv" data-id="${c.id}">
        <span class="tx"><b>${esc(c.title || '新对话')}</b>
        <small>${nu} 句 ｜ ${nf} 张图</small></span>
        <button class="del" data-act="delconv" data-id="${c.id}" title="删掉">×</button></div>`;
    }).join('') + '</div>';
  }

  const CATS = { EH: ['🔥', '加热'], M: ['⚙️', '电机 / 泵'], CTRL: ['🔔', '开关 / 定时 / 阀'] };
  const ASKS = ['我要一个控制柜', '给冷库做个柜子', '有个大电机要启动', '饭店厨房排烟',
    '水箱要加热', '做个星三角启动柜', '补水排水都要', '要能定时控制'];

  function renderSide() {
    const L = window.LIB || {};
    let h = '';

    // ① 我的对话 —— 放最前（他最常要的就是「接着刚才那个聊」）
    h += `<div class="grp"><button class="ghd" data-act="grp">
      <span class="ico">💬</span><span>我的对话</span><span class="arw">▾</span></button>
      <div class="gbody">${convosNode()}
      <button id="newConvBtn" data-act="newconv">+ 开个新对话</button></div></div>`;

    // ② 整柜型
    const cabs = L.CABINETS || [];
    if (cabs.length) {
      h += `<div class="grp"><button class="ghd" data-act="grp">
        <span class="ico">🏭</span><span>整柜型（点一下出整柜）</span><span class="arw">▾</span></button>
        <div class="gbody">` + cabs.map((c) => `
        <button class="itm" data-act="cab" data-i="${esc(c.kind)}"><span class="ico">📐</span>
          <span class="tx">${esc(c.name)}<small>${esc(c.one_line || '')}</small></span>
          <span class="go">出图 ›</span></button>`).join('') + '</div></div>';
    }

    // ③ 回路 / 器件（按大类分）
    const byCat = {};
    for (const c of (L.CIRCUITS || [])) (byCat[c.cat] = byCat[c.cat] || []).push(c);
    for (const cat of Object.keys(byCat)) {
      const pair = CATS[cat] || ['📦', cat];
      h += `<div class="grp"><button class="ghd" data-act="grp">
        <span class="ico">${pair[0]}</span><span>${esc(pair[1])}</span><span class="arw">▾</span></button>
        <div class="gbody">` + byCat[cat].map((c) => `
        <button class="itm" data-act="cir" data-q="${esc(c.name)}"><span class="ico">🔹</span>
          <span class="tx">${esc(c.name)}<small>${esc(c.label || '')}</small></span>
          <span class="go">加进图 ›</span></button>`).join('') + '</div></div>';
    }

    // ④ 不知道咋说 —— 给现成问法
    h += `<div class="grp"><button class="ghd" data-act="grp">
      <span class="ico">💬</span><span>不知道咋说？照这些问</span><span class="arw">▾</span></button>
      <div class="gbody">` + ASKS.map((q) => `
      <button class="itm" data-act="say" data-q="${esc(q)}"><span class="ico">💬</span>
        <span class="tx">${esc(q)}</span><span class="go">问 ›</span></button>`).join('') + '</div></div>';

    // ⑤ 设置入口
    h += `<button class="side-ft-btn" data-act="setup">⚙️ AI 接口设置</button>`;

    $('#sideBody').innerHTML = h;
    applyFs();
  }

  // ══════════════════ 事件 ══════════════════
  function bind() {
    $('#send').addEventListener('click', () => {
      const ta = $('#ta');
      const v = ta.value;
      ta.value = ''; ta.style.height = 'auto';
      send(v);
    });
    $('#ta').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#send').click(); }
    });
    $('#ta').addEventListener('input', (e) => {
      const ta = e.target;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    });

    // 全局点击代理
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'say') { closeSide(); send(t.dataset.q); return; }
      if (act === 'chip') { send(t.dataset.q); return; }
      if (act === 'setup') { closeSide(); openSetup(); return; }
      if (act === 'list') {
        if ($('#side').classList.contains('on')) closeSide(); else openSide();
        return;
      }
      if (act === 'closeside') { closeSide(); return; }
      if (act === 'grp') {
        const g = t.parentElement;
        if (g) g.classList.toggle('close');
        return;
      }
      if (act === 'newconv') { newConv(); renderSide(); renderAll(); closeSide(); return; }
      if (act === 'cab') {
        const c = (window.LIB.CABINETS || []).find((x) => x.kind === t.dataset.i);
        closeSide();
        if (c) send('我要做' + c.name);
        return;
      }
      if (act === 'cir') {
        closeSide();
        send('我要一个电控柜，里面要有' + t.dataset.q);
        return;
      }
      if (act === 'fs') {
        FS = +t.dataset.fs || 1;
        try { localStorage.setItem(FSKEY, String(FS)); } catch (e2) { /* 存不了就只在本次生效 */ }
        applyFs();
        return;
      }
      if (act === 'conv') {
        S.cur = t.dataset.id; save(); renderSide(); renderAll(); closeSide(); return;
      }
      if (act === 'delconv') {
        e.stopPropagation();
        const id = t.dataset.id;
        S.convs = S.convs.filter((c) => c.id !== id);
        if (!S.convs.length) newConv(true);
        if (!S.convs.some((c) => c.id === S.cur)) S.cur = S.convs[0].id;
        save(); renderSide(); renderAll(); return;
      }
      const card = t.closest('.card');
      if (card && act === 'open') {
        const m = curConv().msgs[+card.dataset.mi];
        const rec = m && m.result && m.result.recommendations[+card.dataset.ri];
        if (rec) openViewer(rec);
        return;
      }
      if (card && act === 'print') {
        const m = curConv().msgs[+card.dataset.mi];
        const rec = m && m.result && m.result.recommendations[+card.dataset.ri];
        if (rec) savePdf(rec);
        return;
      }
      if (card && act === 'pick') {
        const m = curMsgAt(card);
        if (m) {
          m.picked = true; save();
          alert('记下了：就选这个「' + (m.result.recommendations[+card.dataset.ri].name) + '」');
        }
        return;
      }
      if (card && act === 'fix') {
        const m = curMsgAt(card);
        if (m) {
          const rec = m.result.recommendations[+card.dataset.ri];
          const ta = $('#ta');
          ta.value = `就用「${rec.name}」，但是`;
          ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
        }
        return;
      }
    });

    $('#closeV').addEventListener('click', closeViewer);
    $('#vBody').addEventListener('dblclick', () => {
      const svg = $('#vBody svg');
      if (!svg) return;
      svg.style.width = svg.dataset.fit === '1' ? '1500px' : '100%';
      svg.dataset.fit = svg.dataset.fit === '1' ? '0' : '1';
    });
    $('#vSave').addEventListener('click', () => viewerRec && savePdf(viewerRec));

    $('#closeS').addEventListener('click', closeSetup);
    $('#pSel').addEventListener('change', () => {
      const p = window.LLM.PROVIDERS.find((x) => x.id === $('#pSel').value);
      if (p) { $('#pBase').value = p.base; $('#pModel').value = p.model; }
    });
    $('#pTest').addEventListener('click', testKey);
    $('#pSave').addEventListener('click', () => {
      window.LLM.setCfg({
        providerId: $('#pSel').value,
        base: $('#pBase').value.trim(),
        model: $('#pModel').value.trim(),
        key: $('#pKey').value.trim(),
      });
      closeSetup(); renderAll();
    });
    $('#pClear').addEventListener('click', () => {
      window.LLM.clearCfg(); closeSetup(); renderAll();
    });
  }

  function curMsgAt(card) {
    // 从卡片反查它属于最近的哪条 assistant 消息（简单做法：按索引）
    const c = curConv();
    const mi = +card.dataset.mi;
    return c.msgs[mi];
  }

  // ══════════════════ 启动 ══════════════════
  function boot() {
    load();
    try {
      const f = parseInt(localStorage.getItem(FSKEY) || '1', 10);
      FS = (f === 2 || f === 3) ? f : 1;
    } catch (e) { FS = 1; }
    applyFs();
    bind();
    renderAll();
    renderSide();          // 侧栏先渲染好（大屏上是常驻的）
    // 第一次用又没配接口 → 自动弹设置
    if (!window.LLM.getCfg()) setTimeout(openSetup, 700);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
