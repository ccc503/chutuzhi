// 出图：js_bridge.js + render.py:spec_of 的浏览器移植
// ⚠️ 对照 D:\智库\FDE\cad-agent\js_bridge.js:18-90 与 render.py:55-71
// ⭐⭐ 入参校验这一层存在的意义就是【不许静默失败】：
//    没有它 kind 写错 → 静默按 tank 画；器件名写错 → 静默画成电机圆圈。
//    用户拿到一张"看着没问题、其实错了"的图 = 最危险的情况。
(function () {
  function render(kind, spec, title) {
    const R = window.RefDraw;
    spec = spec || {};
    title = title || spec.name || '';
    let sheet;
    try {
      if (!R.CABINET_KINDS.includes(kind)) {
        return { ok: false, error: `不认识的柜型「${kind}」。能画的是：${R.CABINET_KINDS.join(' / ')}` };
      }

      if (kind === 'tank') {
        const loads = Array.isArray(spec.loads) ? spec.loads : [];
        const ctrls = Array.isArray(spec.ctrls) ? spec.ctrls : [];
        if (!loads.length && !ctrls.length) {
          return { ok: false, error: '至少要有一路负载，或者一个控制器件' };
        }
        for (const it of loads) {
          if (!Array.isArray(it) || it.length < 2) {
            return { ok: false, error: `负载要写成 [类型, 中文用途]，收到 ${JSON.stringify(it)}` };
          }
          if (!R.LOAD_CATS.includes(String(it[0]))) {
            return { ok: false, error:
              `不认识的负载类型「${it[0]}」（第 ${loads.indexOf(it) + 1} 路）。` +
              `只有两种：EH=电加热类（方形）、M=电机/泵类（圆形）` };
          }
        }
        for (const c of ctrls) {
          if (!Object.prototype.hasOwnProperty.call(R.CTRL_DEV, String(c))) {
            return { ok: false, error:
              `不认识的控制器件「${c}」。能画的是：${Object.keys(R.CTRL_DEV).join(' / ')}` };
          }
        }
        sheet = R.build_tank({
          loads: loads.length ? loads : null,
          ctrls: ctrls.length ? ctrls : null,
          has_level: !!spec.has_level,
          has_temp: !!spec.has_temp,
          has_lamp: (spec.has_lamp === undefined) ? true : !!spec.has_lamp,
          phases: (Number(spec.phases) === 1) ? 1 : 3,
        });
      } else if (kind === 'real_cabinet') {
        sheet = R.build_real_cabinet(title || undefined);
      } else if (kind === 'stardelta') {
        sheet = R.build_stardelta({ name: title || undefined, delay_s: 9, kw: spec.kw || 22.0 });
      } else if (kind === 'vfd') {
        sheet = R.build_vfd({ name: title || undefined, kw: spec.kw || 1.3 });
      } else if (kind === 'refrig') {
        sheet = R.build_refrig({ name: title || undefined, kw: spec.kw || 4.0 });
      } else if (kind === 'purifier') {
        sheet = R.build_purifier({ name: title || undefined, fan_kw: spec.fan_kw || 1.5 });
      }

      const problems = R.checkAll(sheet);
      const full = sheet.svg(title || '');
      // ⭐ 拆两份：svg 只有 <svg>…</svg>（嵌进页面用）；html 是完整单页（存下来打印用）
      const m = full.match(/<svg[\s\S]*?<\/svg>/);
      return {
        ok: true,
        svg: m ? m[0] : full,
        html: full,
        chars: full.length,
        elements: sheet.el.length,
        problems,
        clean: problems.filter((p) => !p.startsWith('压字')).length === 0,
        cap: R.maxLoops(),
      };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  /** 把智能体的推荐条目 → 引擎能吃的 spec（render.py:55 spec_of） */
  function spec_of(rec) {
    rec = rec || {};
    const kind = rec.kind || 'tank';
    if (kind === 'tank') {
      return {
        loads: rec.loads || [],
        ctrls: rec.ctrls || [],
        has_level: !!rec.has_level,
        has_temp: !!rec.has_temp,
        has_lamp: (rec.has_lamp === undefined) ? true : !!rec.has_lamp,
        phases: Number(rec.phases) === 1 ? 1 : 3,
      };
    }
    if (kind === 'stardelta' || kind === 'vfd' || kind === 'refrig') {
      return { kw: rec.kw, name: rec.name };
    }
    if (kind === 'purifier') {
      return { fan_kw: rec.fan_kw, name: rec.name };
    }
    return {};
  }

  window.RENDERER = { render, spec_of };
})();
