// capability.py 的浏览器移植 —— 规则数据在 cap_rules.js（自动生成）
// ⚠️ 逐行对照 D:\智库\FDE\cad-agent\capability.py:163-272，改判定逻辑要两边一起改
//    跑在出图【之前】。verdict=CANNOT / PARTLY 时【不许出图】。
(function () {
  const RULES = window.CAPRULES || {};
  const CANNOT = RULES.CANNOT || [];
  const WHAT_I_CAN = RULES.WHAT_I_CAN || [];
  const _LOAD_WORDS = RULES._LOAD_WORDS || [];
  const _CTRL_WORDS = RULES._CTRL_WORDS || [];
  const HAS_CAB = /柜|电控|配电盘|控制屏|控制箱/;

  const _norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();

  /** 看需求里有没有【库里真能画】的东西 —— 有就说"这块我能画"。最多 4 条 */
  function _drawable_parts(question, understanding) {
    const q = _norm(question);
    const und = understanding || {};
    const extra = [String(und.scene || '')]
      .concat((und.clues || []).map(String))
      .concat(Object.keys(und.known || {}).map(String));
    const both = q + ' ' + _norm(extra.join(' '));

    const out = [];
    // ⭐ 只要他提到了"柜"，那这个柜子的电气部分本身就是能画的
    if (HAS_CAB.test(q)) out.push('这个柜子的电气原理图');
    for (const [w, label] of _LOAD_WORDS.concat(_CTRL_WORDS)) {
      if (!w) continue;
      if (both.includes(_norm(w)) && !out.includes(label)) out.push(label);
    }
    return out.slice(0, 4);
  }

  /**
   * 判定「这个需求能不能画」。
   * @returns {{verdict:'CAN'|'PARTLY'|'CANNOT', what_you_want?:string, why_not?:string,
   *            instead?:string, can_still?:string[], what_i_can?:string[], say:string}}
   */
  function judge(question, understanding) {
    const q = _norm(question);
    const und = understanding || {};

    // ⭐ 带"柜/电控/配电"字样的，说明他要的是【柜子】—— soft 软词不再判死
    const hasCab = HAS_CAB.test(q);

    let hit = null;
    for (const k of CANNOT) {
      const words = (k.words || []).concat(hasCab ? [] : (k.soft || []));
      if (words.some((w) => w && q.includes(_norm(w)))) { hit = k; break; }
    }

    if (!hit) return { verdict: 'CAN', say: '' };

    const canStill = _drawable_parts(question, und);

    if (canStill.length) {
      const say =
        `你要的「${hit.name}」我画不了。\n\n` +
        `${hit.why}\n\n` +
        `不过你这个需求里有一块我能画：${canStill.join('、')}。\n` +
        `${hit.instead}`;
      return {
        verdict: 'PARTLY', what_you_want: hit.name, why_not: hit.why,
        instead: hit.instead, can_still: canStill, say,
      };
    }

    const say =
      `这个我画不了 —— 你要的是「${hit.name}」。\n\n` +
      `${hit.why}\n\n` +
      `我能画的是：\n` + WHAT_I_CAN.slice(0, 4).map((x) => '· ' + x).join('\n') + '\n\n' +
      `${hit.instead}`;
    return {
      verdict: 'CANNOT', what_you_want: hit.name, why_not: hit.why,
      instead: hit.instead, what_i_can: WHAT_I_CAN, say,
    };
  }

  window.CAP = { judge, CANNOT, WHAT_I_CAN };
})();
