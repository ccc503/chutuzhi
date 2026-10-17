// library.py 的浏览器移植 —— 数据在 data.js（自动生成），这里只有逻辑
//   · search()      关键词打分检索（需求模糊时本地兜底用，不花 token）
//   · catalog_text() 喂给大模型的"库的目录"—— 它只能从这里挑
// ⚠️ 逐行对照 D:\智库\FDE\cad-agent\library.py:187-252，改库逻辑要两边一起改
(function () {
  const D = window.LIBDATA || {};
  const CABINETS  = D.CABINETS  || [];
  const CIRCUITS  = D.CIRCUITS  || [];
  const SWITCHES  = D.SWITCHES  || [];
  const PARTS     = D.PARTS     || [];
  const SCENARIOS = D.SCENARIOS || [];

  function _hits(text, words) {
    const t = String(text || '').toLowerCase();
    let n = 0;
    for (const w of words) {
      if (!w) continue;
      const lw = String(w).toLowerCase();
      if (lw && t.includes(lw)) n++;
    }
    return n;
  }

  /** 返回 [ [score, type, item, matchedWords], ... ]（已排序、已过滤、已截断） */
  function search(question, top = 6, minScore = 1) {
    const q = String(question || '');
    const ql = q.toLowerCase();
    const scored = [];
    const add = (s, typ, item, words) => {
      const m = words.filter(w => w && String(w).toLowerCase() && ql.includes(String(w).toLowerCase()));
      scored.push([s, typ, item, m]);
    };

    for (const c of CABINETS) {
      const words = [...c.keywords, ...c.signals, c.name];
      const s = _hits(q, c.keywords) * 3 + _hits(q, c.signals) * 2 + _hits(q, [c.name]);
      add(s, 'cabinet', c, words);
    }
    for (const c of CIRCUITS) {
      const words = [c.name, c.label, c.why];
      add(_hits(q, words) * 3, 'circuit', c, words);
    }
    for (const sc of SCENARIOS) {
      const words = [sc.name, sc.assume];
      add(_hits(q, words) * 2, 'scenario', sc, words);
    }

    scored.sort((a, b) => b[0] - a[0]);
    return scored.filter(x => x[0] >= minScore).slice(0, top);
  }

  /** ⭐ 喂给大模型的"库的目录"—— 它只能从这里挑 */
  function catalog_text() {
    const L = ['【本库能画的整柜（kind）】'];
    for (const c of CABINETS) {
      L.push(`- kind=${c.kind}｜${c.name}｜${c.one_line}`);
      L.push(`    什么时候用：${c.when}`);
      L.push(`    能装：${c.signals.join('、')}`);
      if (c.capacity) L.push(`    容量：${c.capacity}`);
    }
    L.push('');
    L.push('【能拼进通用柜的回路/器件】');
    for (const c of CIRCUITS) L.push(`- ${c.name}（${c.label}）—— ${c.why}`);
    L.push('');
    L.push('【通用柜的开关项】');
    for (const s of SWITCHES) L.push(`- ${s.name}：${s.why}`);
    L.push('');
    L.push('【典型场景（需求模糊时可当假设）】');
    for (const sc of SCENARIOS) L.push(`- ${sc.name}：${sc.assume}`);
    L.push('');
    L.push('【元器件库（照实物抄的型号）】');
    for (const p of PARTS) L.push(`- ${p[0]} ${p[1]} ${p[2]}（${p[3]}）`);
    return L.join('\n');
  }

  window.LIB = { CABINETS, CIRCUITS, SWITCHES, PARTS, SCENARIOS, search, catalog_text };
})();
