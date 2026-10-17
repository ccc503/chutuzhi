// agent.py 的浏览器移植 —— 一句话需求 → 读懂 → 推荐 ≥3 → 真出图 + 自检 → 兜底
// ⚠️ 逐段对照 D:\智库\FDE\cad-agent\agent.py:37-341 / 434-605
// ⭐⭐ 两条硬规矩（Python 版踩过坑，这里保留）：
//   · 模糊 ≠ 编数字。看不清就写明假设，绝不静默替用户决定
//   · 「推荐三种以上」必须【代码保证】，不能指望模型每次听话
(function () {
  const LIB = window.LIB, CAPJ = window.CAP, RND = window.RENDERER, P = window.PROMPTS, LLM = window.LLM;
  const MIN_RECS = 3, MAX_HIST = 8, CAP_LOADS = 12;

  const VALID_KINDS = new Set(LIB.CABINETS.map((c) => c.kind));
  const VALID_CTRLS = new Set(LIB.CIRCUITS.filter((c) => c.cat === 'CTRL').map((c) => c.name));
  const NAME2CAT = {};
  for (const c of LIB.CIRCUITS) NAME2CAT[c.name] = c.cat;

  const _s = (v) => String(v == null ? '' : v).trim();

  /** 前面聊过的拼成一段上下文（agent.py:37 _hist_text） */
  function histText(hist, limit) {
    const rows = (hist || []).slice(-(limit || MAX_HIST));
    if (!rows.length) return '';
    const lines = ['【前面聊过的】'];
    for (const m of rows) {
      const who = m.role === 'user' ? '他' : '你';
      const txt = String(m.content || '').replace(/\s+/g, ' ').slice(0, 220);
      lines.push(`  ${who}：${txt}`);
    }
    lines.push('（上面这些他已经说过了，别再重复问；他只说「2 路」这种，就是接着上面在回答）\n');
    return lines.join('\n') + '\n';
  }

  /** 把模型给的一条推荐规整成引擎能吃的样子（agent.py:198 _norm_rec） */
  function normRec(r, idx, source, basis) {
    r = r || {};
    let kind = _s(r.kind === undefined ? 'tank' : r.kind);
    const kindFixed = !VALID_KINDS.has(kind);
    if (kindFixed) kind = 'tank';

    const loads = [], seen = {};
    for (const it of (r.loads || [])) {
      let cat, cn;
      if (Array.isArray(it) && it.length >= 2) { cat = String(it[0]).toUpperCase(); cn = _s(it[1]); }
      else if (it && typeof it === 'object') { cat = String(it.type == null ? '' : it.type).toUpperCase(); cn = _s(it.name); }
      else if (typeof it === 'string') { cat = NAME2CAT[it] || 'M'; cn = it; }
      else continue;
      if (!(cat === 'EH' || cat === 'M') || !cn) continue;
      // ⭐ 图上每路底下会自动加「1.」「2.」编号 —— 模型若自己带了「1.补水泵」就会变成「1.1.补水泵」
      cn = cn.replace(/^\s*\d+\s*[.、·:：]\s*/, '').trim() || cn;
      seen[cn] = (seen[cn] || 0) + 1;
      loads.push([cat, seen[cn] === 1 ? cn : `${cn}${seen[cn]}`]);
    }

    const ctrls = [];
    for (const c of (r.ctrls || [])) {
      const s = _s(c);
      if (VALID_CTRLS.has(s)) ctrls.push(s);
    }

    const ph = String(r.phases === undefined ? 3 : r.phases).trim();
    const phases = (ph === '1' || ph === '单相' || ph === '220') ? 1 : 3;

    return {
      n: idx,
      kind,
      name: _s(r.name) || `方案 ${idx}`,
      why: _s(r.why),
      assume: _s(r.assume),
      loads: loads.slice(0, CAP_LOADS),
      ctrls: ctrls.slice(0, 8),
      has_level: !!r.has_level,
      has_temp: !!r.has_temp,
      has_lamp: r.has_lamp == null ? true : !!r.has_lamp,
      phases,
      kw: r.kw === undefined ? null : r.kw,
      fan_kw: r.fan_kw === undefined ? null : r.fan_kw,
      picks: (r.picks || []).map(String),
      source: source || 'model',
      basis: Array.isArray(basis) ? basis.slice() : [],
      warn: kindFixed ? ['模型给的 kind 不认识，已按通用柜画'] : [],
    };
  }

  /** ⭐ 兜底：模型不听话 / API 挂了 → 用库里的典型场景凑够 need 个（代码保证） */
  function fallback(question, und, need) {
    und = und || {};
    const q2 = [
      question,
      String(und.scene || ''),
      (und.clues || []).map(String).join(' '),
      Object.keys(und.known || {}).join(' '),
    ].join(' ').trim();

    const hits = LIB.search(q2, 8);   // search 已带 minScore=1，不相关的不返回
    const recs = [], used = new Set();

    // ① 先把检索到的整柜型放进去
    for (const [score, typ, item, matched] of hits) {
      if (recs.length >= need) break;
      if (typ !== 'cabinet' || used.has(item.kind)) continue;
      used.add(item.kind);
      const hitTxt = matched.length ? `（命中：${matched.slice(0, 3).join('、')}）` : '';
      const kw = {
        kind: item.kind,
        name: item.name + '（按库里的标准做法）',
        why: `你提到的事跟「${item.name}」对得上${hitTxt}：${item.one_line}`,
        assume: '先按这个柜型的标准做法出一版，哪里不对你说，我改。',
        picks: item.signals.slice(0, 4),
      };
      if (item.kind === 'tank') {
        // ⚠️ kind=tank 必须带负载，否则引擎会拒（"至少要有一路负载"）
        const sc = LIB.SCENARIOS.find((s) => q2.includes(s.name) || q2.includes(s.assume)) || LIB.SCENARIOS[0];
        Object.assign(kw, {
          loads: sc.loads.map((x) => x.slice()),
          ctrls: sc.ctrls.slice(),
          has_level: sc.switches.level,
          has_temp: sc.switches.temp,
          has_lamp: sc.switches.lamp,
          phases: 3,
        });
        kw.assume = `先按最常见的配置出一版：${sc.assume}。哪里不对你说，我改。`;
      }
      recs.push(normRec(kw, recs.length + 1, 'library', [item.name]));
    }

    // ② 不够就用典型场景
    for (const sc of LIB.SCENARIOS) {
      if (recs.length >= need) break;
      recs.push(normRec({
        kind: 'tank', name: sc.name,
        why: `如果只是普通场合，这个配置最常见：${sc.assume}`,
        assume: sc.assume,
        loads: sc.loads.map((x) => x.slice()),
        ctrls: sc.ctrls.slice(),
        has_level: sc.switches.level, has_temp: sc.switches.temp, has_lamp: sc.switches.lamp,
        phases: 3,
      }, recs.length + 1, 'library', [`典型场景〈${sc.name}〉`]));
    }

    // ③ 还不够 → 不同规模的通用柜（保证一定凑够）
    for (const [label, n] of [['小规模', 2], ['中规模', 4], ['大规模', 8]]) {
      if (recs.length >= need) break;
      const loads = [];
      for (let i = 0; i < n; i++) loads.push(['M', `水泵${i + 1}`]);
      recs.push(normRec({
        kind: 'tank', name: `${label}通用控制柜（${n} 路）`,
        why: '按最常见的做法先出一个规模，你看着改。',
        assume: `假设 ${n} 路负载，三相 380V，带液位和指示灯`,
        loads, ctrls: [],
        has_level: true, has_temp: false, has_lamp: true, phases: 3,
      }, recs.length + 1, 'library', ['库里的通用规模模板']));
    }

    return recs.slice(0, Math.max(need, MIN_RECS));
  }

  const ASK_CHIPS = {
    供电电压: ['三相 380V', '单相 220V'],
    几路负载: ['2 路', '4 路', '6 路'],
    负载功率: ['3kW 以内', '5~10kW', '10kW 以上'],
    控制方式: ['手动按钮', '定时控制', '液位自动'],
  };

  /** ⭐ 人机回环 —— 故意不做成闸门，只给一排可点的按钮（agent.py:355） */
  function nextQuestions(und) {
    const crit = ((und || {}).critical || []).map(String);
    const out = [], seen = new Set();
    for (const k of crit) {
      for (const key of Object.keys(ASK_CHIPS)) {
        if (k.includes(key) && !seen.has(key)) {
          seen.add(key); out.push({ key, options: ASK_CHIPS[key] }); break;
        }
      }
    }
    if (!out.length) {
      for (const key of Object.keys(ASK_CHIPS)) out.push({ key, options: ASK_CHIPS[key] });
    }
    return out.slice(0, 3);
  }

  /** 出图失败 → 按库里标准配置补上缺的再试一次（agent.py:375 _repair） */
  function repair(r) {
    const fix = {};
    if (r.kind === 'tank' && !(r.loads || []).length) {
      const sc = LIB.SCENARIOS[0];
      fix.loads = sc.loads.map((x) => x.slice());
      fix.ctrls = (r.ctrls && r.ctrls.length) ? r.ctrls : sc.ctrls.slice();
    }
    return Object.keys(fix).length ? fix : null;
  }

  // ── 轻量日志（手机上排查用；不落服务器）──
  const LOG_KEY = 'chutuzhi.log.v1';
  function logRow(row) {
    try {
      const arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      arr.push(row);
      while (arr.length > 30) arr.shift();
      localStorage.setItem(LOG_KEY, JSON.stringify(arr));
    } catch (e) { /* ⚠️ 日志绝不能把主流程搞挂 */ }
  }

  /**
   * 主流程。
   * @param {string} question
   * @param {{n?:number, history?:Array, wantSvg?:boolean, onStep?:(s:string)=>void}} opt
   */
  async function recommend(question, opt) {
    opt = opt || {};
    const n = Math.max(MIN_RECS, parseInt(opt.n, 10) || MIN_RECS);
    const extraCtx = histText(opt.history);
    const wantSvg = opt.wantSvg !== false;
    const step = (s) => { try { opt.onStep && opt.onStep(s); } catch (e) {} };
    const t0 = Date.now();
    const trace = { steps: [] };
    const pushStep = (s) => { trace.steps.push(s); step(s); };

    question = _s(question);

    // ── ⓪ ⭐⭐ 能力判定：跑在模型【外面】，而且跑在【出图之前】──
    //    判成 CANNOT 就【不出图、不调模型】，直接把话说清楚（用户原话 m02358：「不要给它顶替」）
    const cap = CAPJ.judge(question);
    if (cap.verdict === 'CANNOT') {
      pushStep(`⓪ 能力判定 ❌ 画不了（${cap.what_you_want}）`);
      const result = {
        ok: true, kind: 'cannot', question, reply: cap.say, capability: cap,
        understanding: {}, isVague: false, count: 0, recommendations: [],
        nextQuestions: [], trace, llmError: null, notice: '',
        ms: Date.now() - t0,
      };
      logRow({ ts: new Date().toISOString(), q: question.slice(0, 200), kind: 'cannot', ms: result.ms });
      return result;
    }
    pushStep(cap.verdict === 'PARTLY'
      ? `⓪ 能力判定 ⚠️ 有一块画不了（${cap.what_you_want}）`
      : '⓪ 能力判定 ✅ 能画');

    // ── ① 读懂需求 ──
    let und = {};
    let llmError = null;
    try {
      und = await LLM.chatJSON({
        system: P.SYS_UNDERSTAND.replace('<<HISTORY>>', extraCtx),
        user: `用户说：${question}`,
      });
      pushStep('① 读懂需求 ✅');
    } catch (e) {
      llmError = String((e && e.message) || e).slice(0, 200);
      und = { reply: '', scene: question, clues: [], known: {}, missing: [], critical: [], is_vague: true };
      pushStep(`① 读懂需求 ⚠️ 回退（${llmError.slice(0, 40)}）`);
    }

    // ── ② 生成 ≥n 个方案 ──
    // ⚠️ 提示词里有 JSON 花括号 → 绝不能用模板字符串去"格式化"整个提示词
    const sysRec = P.SYS_RECOMMEND
      .replace('<<HISTORY>>', extraCtx)
      .replace('<<N>>', String(n))
      .replace('<<CATALOG>>', LIB.catalog_text())
      .replace('<<QUESTION>>', question)
      .replace('<<UNDERSTANDING>>', JSON.stringify(und));

    let recs = [], lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        let userMsg = `给这个人推荐 ${n} 个以上方案：${question}`;
        if (lastErr) {
          userMsg += `\n\n⚠️ 你上次的输出没解析成功（${lastErr}）。` +
            '这次请**只输出一个 JSON 对象**，不要任何解释文字、不要 markdown 围栏。';
        }
        const out = await LLM.chatJSON({ system: sysRec, user: userMsg });
        recs = ((out && out.recommendations) || []).map((r, i) => normRec(r, i + 1, 'model'));
        if (!recs.length) throw new Error('recommendations 是空的');
        // ⭐ 给模型方案也标上依据 —— 否则界面上分不清"库里的成熟做法"还是"模型编的"
        const clues = (und.clues || []).map(String);
        let libs = [];
        if (!clues.length) {
          libs = LIB.search(`${question} ${und.scene || ''}`, 3)
            .map((h) => String(h[2].name || h[2].kind));
        }
        for (const r of recs) {
          if (!r.basis.length) r.basis = clues.slice(0, 4).length ? clues.slice(0, 4) : libs.slice(0, 3);
        }
        lastErr = null;
        llmError = null;
        pushStep(`② 生成方案 ✅ 模型给了 ${recs.length} 个` + (attempt > 1 ? '（第 2 次才成）' : ''));
        break;
      } catch (e) {
        lastErr = String((e && e.message) || e).slice(0, 120);
        llmError = lastErr;
        if (e && e.needSetup) break;      // 没配 key 就别重试了，直接走兜底
      }
    }
    if (!recs.length) pushStep('② 生成方案 ⚠️ 回退（连试 2 次都没成）');

    // ── ③ ⭐ 代码保证 ≥n（模型不听话就在这里补）──
    if (recs.length < n) {
      const before = recs.length;
      const have = new Set(recs.map((r) => r.kind + '\u0000' + r.name));
      for (const r of fallback(question, und, n)) {
        if (recs.length >= n) break;
        if (have.has(r.kind + '\u0000' + r.name)) continue;
        r.n = recs.length + 1;
        recs.push(r);
      }
      pushStep(`③ 补齐到 ${n} 个 ✅（模型给 ${before}，本地补 ${recs.length - before}）`);
    } else {
      pushStep('③ 数量已够 ✅');
    }

    // ── ④ 真出图 + 自检（失败就修一把再试一次）──
    let okCnt = 0;
    for (const r of recs) {
      let spec = RND.spec_of(r);
      spec.name = r.name;
      let res = RND.render(r.kind, spec, r.name);
      if (!res.ok) {
        const fixed = repair(r);
        if (fixed) {
          const r2 = Object.assign({}, r, fixed);
          spec = RND.spec_of(r2);
          spec.name = r2.name;
          const res2 = RND.render(r2.kind, spec, r2.name);
          if (res2.ok) {
            Object.assign(r, fixed);
            r.repaired = true;
            r.warn = (r.warn || []).concat(['模型给的参数画不出来，已按库里标准配置补上']);
            res = res2;
          }
        }
      }
      r.renderOk = !!res.ok;
      r.problems = res.ok ? (res.problems || []) : [res.error];
      // ⭐ 只存 spec 不存 SVG（一张图 15~27KB，多存几轮 localStorage 就爆）
      //    切回来时本地重画一遍 —— 引擎很快，不用调模型
      r.spec = spec;
      if (res.ok) {
        okCnt++;
        if (wantSvg) { r.svg = res.svg; r.html = res.html; }
        r.chars = res.chars;
        r.elements = res.elements;
      }
    }
    pushStep(`④ 出图 ✅ ${okCnt}/${recs.length} 张成功`);

    // ── ⑤ 该补问的 ──
    const nqs = nextQuestions(und);

    // ── ⑥ 一句人话回复（像聊天，不是一上来吐一屏卡片）──
    let reply = _s(und.reply);
    if (!reply) {
      const sc = _s(und.scene) || question;
      reply = `你要的是${sc}。下面给你 ${recs.length} 个方案，挑一个看着顺眼的。`;
    }
    if (cap.verdict === 'PARTLY') reply = cap.say + '\n\n' + reply;
    if (llmError) reply += '\n（刚才大模型没连上，下面这些是按库里的标准做法给的。）';

    const result = {
      ok: true, kind: 'answer', question, reply, capability: cap,
      understanding: und, isVague: und.is_vague !== false,
      count: recs.length, recommendations: recs, nextQuestions: nqs,
      trace, llmError,
      notice: llmError ? `⚠️ 刚才没用上大模型（${llmError.slice(0, 60)}），下面这些是按库里的标准做法给的。` : '',
      ms: Date.now() - t0,
    };
    logRow({
      ts: new Date().toISOString(), q: question.slice(0, 200), ms: result.ms,
      llm_error: llmError ? llmError.slice(0, 120) : null,
      recs: recs.map((r) => ({ n: r.n, kind: r.kind, source: r.source, render_ok: r.renderOk })),
    });
    return result;
  }

  window.AGENT = { recommend, MIN_RECS, normRec, fallback, histText };
})();
