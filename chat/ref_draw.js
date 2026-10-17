/**
 * ref_draw.js —— ⭐【参考图样式】渲染器（JavaScript 版）
 * ════════════════════════════════════════════════════════════════════
 * 这是 `cad-app/v3/ref_draw.py` 的【逐行翻译】。
 * ⚠️ 翻译纪律（重要）：
 *   ① 一个字都不改语义 —— 输出必须跟 Python 版【逐字节一致】
 *   ② 每翻一块立刻 `node compare.js` 跟基准比（基准在 v4/baseline/）
 *   ③ 数字格式化统一走 F2()，跟 Python 的 f"{x:.2f}" 对齐
 *
 * 为什么要翻：见会话里的架构讨论 —— 翻完就能【不要后端】，
 * 手机不连电脑也能出图（纯前端单文件网页）。
 */

// ══ 画布 ══
const W = 420.0, H = 297.0;

// ══ 样式常量 ══
const INK  = '#1a1a1a';
const RED  = '#c0392b';
const CYAN = '#3aa8a0';
const DIM  = '#5f5f5f';
const LW   = 0.28;
const LW_B = 0.45;
const KM_OFF = 4.2;
const FONT = 'PingFang SC,Microsoft YaHei,SimHei,Noto Sans CJK SC,sans-serif';
const MONO = 'Consolas,JetBrains Mono,Courier New,monospace';

// ⚠️ Python 的 f"{420.0}" 输出 "420.0"（带小数点），JS 的 `${420}` 是 "420"
//    → viewBox 里必须写死这两个字符串，否则跟基准差一个 ".0"
const W_TXT = '420.0', H_TXT = '297.0';

// ══ 分区 y ══
const M      = 10.0;
const BUS_Y  = [28.0, 40.0, 52.0, 64.0];
const KM_TOP = 95.0;
const EH_Y   = 132.0;
const CTRL_Y = 166.0;
const CTRL_N = 246.0;
const BUS_X0 = 42.0;
const QF_X   = 24.0;

const TAP_X0 = 62.0;
const TAP_X1 = W - M - 24.0;
const TAP_MIN_GAP = 19.0;
const POLE_GAP = 6.4;
const POLE_SPAN = POLE_GAP * 2;
const LOAD_GAP = 13.4;
const LOAD_PITCH = POLE_SPAN + LOAD_GAP;

// ⭐⭐ 控制回路器件（2026-10-05）—— 用户要求"库里每个字都得真画出来"
const CTRL_X0  = 46.0;
const CTRL_W   = 42.0;
const CTRL_H   = 22.0;
const CTRL_GAP = 6.0;
const CTRL_LIM = 356.0;

const CTRL_DEV = {
  '温度控制器':   [38.0, 'box'],
  '水位控制器':   [38.0, 'box'],
  '时控开关':     [38.0, 'box'],
  '定时循环':     [38.0, 'box'],
  '高低水位报警':  [46.0, 'box'],
  '电磁阀':       [36.0, 'coil'],
  '电动阀':       [36.0, 'coil'],
};
const CTRL_ORDER = ['时控开关', '定时循环', '高低水位报警', '电磁阀', '电动阀'];

/**
 * ⭐ 数字格式化 —— 复刻 Python 的 f"{x:.2f}"
 * ⚠️ JS toFixed 对 .xx5 用"四舍五入远离零"，Python 用"银行家舍入"。
 *    实测我们的坐标值几乎不会踩到边界；compare.js 有容差模式兜底。
 */
function F2(x) {
  if (!isFinite(x)) return String(x);
  return x.toFixed(2);
}

/** ⭐ 复刻 Python 的 f"{x:.0f}"（取整） */
function F0(x) {
  if (!isFinite(x)) return String(x);
  return Math.round(x).toString();
}

/**
 * ⭐ 复刻 Python 的 str(float)：整数浮点要带 ".0"
 * ⚠️ Python str(15.0) = "15.0"，JS String(15) = "15" —— 不补就跟基准差一个 ".0"
 */
function PYF(x) {
  if (!isFinite(x)) return String(x);
  if (Number.isInteger(x)) return x.toFixed(1);
  return String(x);
}

function maxLoops() {
  return Math.max(1, Math.floor((TAP_X1 - TAP_X0) / LOAD_PITCH));
}

/**
 * ⭐⭐ 控制回路一行最多放几个器件 —— 用户报"加 8 个电动阀但图上没有"
 * 根因：界面允许 8 个，但一行只能放 5~7 个 → 多的【静默不画】
 */
function ctrlCapacity(hasTemp = true, hasLevel = true) {
  const fixed = (hasTemp ? 1 : 0) + (hasLevel ? 1 : 0);
  const w = 40.0;
  let total = 0, x = CTRL_X0;
  while (x + w <= CTRL_LIM) { total++; x += w + CTRL_GAP; }
  return { total, extra: Math.max(0, total - fixed) };
}

function loadXs(i) {
  const x0 = TAP_X0 + i * LOAD_PITCH;
  return [x0, x0 + POLE_GAP, x0 + POLE_SPAN];
}

function taps(n) {
  if (n <= 0) return [];
  if (n === 1) return [(TAP_X0 + TAP_X1) / 2];
  const span = TAP_X1 - TAP_X0;
  const step = span / n;
  return Array.from({ length: n }, (_, i) => TAP_X0 + step * (i + 0.5));
}

class Sheet {
  constructor(phases = 3) {
    this.el = [];
    this.phases = (Number(phases) === 1) ? 1 : 3;
    this.busy = (this.phases === 1) ? [BUS_Y[0], BUS_Y[1]] : BUS_Y.slice();
    this.bus_names = (this.phases === 1) ? ['L', 'N'] : ['L1', 'L2', 'L3', 'N'];
  }

  // ── 基本图元 ──
  line(x1, y1, x2, y2, w = LW, c = INK) {
    this.el.push(`<line x1="${F2(x1)}" y1="${F2(y1)}" x2="${F2(x2)}" y2="${F2(y2)}" ` +
                 `stroke="${c}" stroke-width="${w}"/>`);
  }

  dot(x, y) {
    this.el.push(`<circle cx="${F2(x)}" cy="${F2(y)}" r="0.75" fill="${CYAN}" stroke="none"/>`);
  }

  text(x, y, s, sz = 3.0, c = INK, anchor = 'start', mono = false, bold = false) {
    const fam = mono ? MONO : FONT;
    const fw = bold ? ' font-weight="600"' : '';
    this.el.push(`<text x="${F2(x)}" y="${F2(y)}" font-size="${F2(sz)}" ` +
                 `text-anchor="${anchor}" font-family="${fam}" fill="${c}" ` +
                 `stroke="none"${fw}>${s}</text>`);
  }

  term(x, y) {
    this.el.push(`<circle cx="${F2(x)}" cy="${F2(y)}" r="0.9" fill="none" ` +
                 `stroke="${INK}" stroke-width="${LW}"/>`);
  }

  rect(x, y, w, h, sw = LW) {
    this.el.push(`<rect x="${F2(x)}" y="${F2(y)}" width="${F2(w)}" height="${F2(h)}" ` +
                 `fill="none" stroke="${INK}" stroke-width="${sw}"/>`);
  }

  ground(x, y) {
    // ⚠️ 画成一条 path（不是四根 line）—— 否则连通性自检会把三根横线的端点当"悬空"
    this.el.push(
      `<path d="M ${F2(x)} ${F2(y)} V ${F2(y + 5.4)} ` +
      `M ${F2(x - 3.0)} ${F2(y + 2.6)} H ${F2(x + 3.0)} ` +
      `M ${F2(x - 1.9)} ${F2(y + 4.0)} H ${F2(x + 1.9)} ` +
      `M ${F2(x - 0.9)} ${F2(y + 5.4)} H ${F2(x + 0.9)}" ` +
      `fill="none" stroke="${INK}" stroke-width="${LW}"/>`);
  }

  frame() {
    this.rect(M, M, W - 2 * M, H - 2 * M, LW_B);
    const g = 3.0;
    this.rect(M + g, M + g, W - 2 * (M + g), H - 2 * (M + g), LW);
  }

  buses(x_end = null) {
    const xe = (x_end !== null) ? x_end : W - M - 6.0;
    for (let i = 0; i < this.busy.length; i++) {
      const y = this.busy[i], nm = this.bus_names[i];
      this.term(QF_X - 14.0, y);
      this.line(QF_X - 13.1, y, QF_X - 6.0, y);
      this.text(QF_X - 17.5, y + 1.1, nm, 3.0, INK, 'end', true);
      this.line(BUS_X0, y, xe, y, LW_B);
    }
  }

  qf(name = 'QF1') {
    for (const y of this.busy) {
      this.line(QF_X - 6.0, y, QF_X - 2.0, y);
      this.line(QF_X - 2.0, y, QF_X + 1.6, y - 2.6, LW, INK);
      this.line(QF_X + 1.6, y, QF_X + 5.0, y);
      this.line(QF_X + 6.4, y - 1.2, QF_X + 8.8, y + 1.2, LW * 0.9);
      this.line(QF_X + 6.4, y + 1.2, QF_X + 8.8, y - 1.2, LW * 0.9);
      this.line(QF_X + 8.8, y, BUS_X0, y, LW_B);
    }
    if (this.busy.length > 1) {
      this.el.push(
        `<line x1="${F2(QF_X - 0.2)}" y1="${F2(this.busy[0])}" ` +
        `x2="${F2(QF_X - 0.2)}" y2="${F2(this.busy[this.busy.length - 1])}" ` +
        `stroke="${INK}" stroke-width="${LW}" stroke-dasharray="2.2 1.8"/>`);
    }
    this.text(QF_X + 1.0, BUS_Y[0] - 5.0, name, 3.4, INK, 'middle', true);
  }

  /**
   * ⭐⭐⭐ 三极【并排】的接触器（照参考图逐极数出来的）
   * x0 = 第一极的 x；返回 { xs: 三根出线的 x, yo: 出线结束的 y }
   * ⚠️⚠️ 原来画成"一根竖线串三个触点"→ 把 L1/L2/L3 连在一起 = 相间短路
   */
  contactor(x0, name, y = null, poles = 3) {
    const ys = (y !== null) ? y : KM_TOP;
    const xs = [], xins = [];
    for (let i = 0; i < poles; i++) {
      const x = x0 + i * POLE_GAP;
      xins.push(x);
      this.line(x, ys - 6.0, x, ys);
      const ar = 1.6;
      this.el.push(
        `<path d="M ${F2(x - ar)} ${F2(ys)} A ${F2(ar)} ${F2(ar)} 0 0 0 ` +
        `${F2(x + ar)} ${F2(ys)}" fill="none" stroke="${INK}" ` +
        `stroke-width="${LW}"/>`);
      const xo = x + KM_OFF;
      this.line(x - ar, ys, xo, ys + 6.2, LW, INK);
      this.line(xo, ys + 6.2, xo, ys + 9.5);
      xs.push(xo);
    }
    // ⭐ 红色机械联动线：两端必须落在第一/第三极的斜线上
    if (poles >= 2) {
      const yb = ys + 1.7;
      const k = 1.7 / 6.2;
      const xa = xins[0] - 1.6 + k * (KM_OFF + 1.6);
      const xb = xins[xins.length - 1] - 1.6 + k * (KM_OFF + 1.6);
      this.line(xa, yb, xb, yb, LW * 1.25, RED);
    }
    this.text(x0 - 3.4, ys - 7.6, name, 3.2, INK, 'start', true);
    return { xs, yo: ys + 9.5 };
  }

  lamp(x, y, name, r = 3.4) {
    this.el.push(`<circle cx="${F2(x)}" cy="${F2(y)}" r="${r}" fill="none" ` +
                 `stroke="${INK}" stroke-width="${LW}"/>`);
    const d = r * 0.7;
    this.line(x - d, y - d, x + d, y + d);
    this.line(x - d, y + d, x + d, y - d);
    this.text(x, y - 5.5, name, 3.1, INK, 'middle', true);
  }

  ctrl_box(x, y, w, h, name) {
    this.rect(x, y, w, h);
    this.text(x + w / 2, y + h / 2 + 1.2, name, 3.3, INK, 'middle');
    this.text(x + 2.0, y - 1.6, 'L', 2.8, INK, 'start', true);
    this.text(x + w - 2.0, y - 1.6, 'N', 2.8, INK, 'end', true);
  }

  load(x, y, label, w = 13.0, h = 8.0, kind = 'EH') {
    if (kind === 'EH') {
      this.rect(x, y, w, h);
      this.text(x + w / 2, y + h - 2.2, label, 3.0, INK, 'middle');
    } else {
      const cx = x + w / 2, cy = y + h / 2, r = 4.6;
      this.el.push(`<circle cx="${F2(cx)}" cy="${F2(cy)}" r="${r}" fill="none" ` +
                   `stroke="${INK}" stroke-width="${LW}"/>`);
      this.text(cx, cy + 1.3, label, 3.0, INK, 'middle');
      this.text(cx, cy + r + 3.6, 'M', 2.6, DIM, 'middle', true);
    }
  }

  /** ⭐ 把三相负载接在三根并排竖线上（加热=横跨方框；电机=圆圈，外侧线短） */
  load3(xs, y_from, label, kind = 'EH') {
    const mid = (xs[0] + xs[xs.length - 1]) / 2;
    if (kind === 'EH') {
      const w = (xs[xs.length - 1] - xs[0]) + 6.4;
      for (const xo of xs) this.line(xo, y_from, xo, EH_Y - 4.0);
      this.rect(mid - w / 2, EH_Y - 4.0, w, 9.0);
      this.text(mid, EH_Y + 2.6, label, 3.0, INK, 'middle');
    } else {
      const r = 8.2, cy = EH_Y + 3.0;
      for (const xo of xs) {
        const d2 = r * r - (xo - mid) ** 2;
        const dy = d2 > 0 ? Math.sqrt(d2) : 0.0;
        this.line(xo, y_from, xo, cy - dy);
      }
      this.el.push(`<circle cx="${F2(mid)}" cy="${F2(cy)}" r="${r}" fill="none" ` +
                   `stroke="${INK}" stroke-width="${LW}"/>`);
      this.text(mid, cy + 1.4, label, 3.4, INK, 'middle');
      this.text(mid, cy + r + 4.2, 'M', 2.6, DIM, 'middle', true);
    }
  }

  button(x, y, name) {
    this.line(x, y - 5.0, x, y - 1.8);
    this.line(x, y - 1.8, x + 2.8, y - 1.8);
    this.line(x + 2.8, y - 1.8, x + 5.4, y - 4.6, LW, INK);
    this.line(x + 5.4, y - 4.6, x + 5.4, y - 1.8);
    this.line(x + 5.4, y - 1.8, x + 5.4, y + 5.2);
    this.text(x + 2.7, y + 9.0, name, 3.0, INK, 'middle', true);
  }

  coil(x, y, name, w = 7.0, h = 13.0, side = 'right') {
    this.rect(x - w / 2, y, w, h);
    if (side === 'right') {
      this.text(x + w / 2 + 1.8, y + h - 4.4, name, 3.1, INK, 'start', true);
    } else {
      this.text(x - w / 2 - 1.8, y + h - 4.4, name, 3.1, INK, 'end', true);
    }
  }

  float_label(x, y, name = '浮球') {
    this.text(x, y, name, 3.2, INK, 'middle');
  }

  /** 返回问题清单（空 = 全过）—— 跟 Python 版逐条对应 */
  selfcheck() {
    const probs = [];
    const lines = [], rects = [], texts = [];
    for (const e of this.el) {
      let m = e.match(/^<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/);
      if (m) lines.push(m.slice(1, 5).map(Number));
      m = e.match(/^<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
      if (m) rects.push(m.slice(1, 5).map(Number));
      m = e.match(/^<text x="([\d.]+)" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)</);
      if (m) texts.push([Number(m[1]), Number(m[2]), Number(m[3]), m[4]]);
    }
    // ① 超界
    for (const r of rects) {
      const [x, y, w, h] = r;
      if (x < M - 0.5 || y < M - 0.5 || x + w > W - M + 0.5 || y + h > H - M + 0.5) {
        probs.push(`超界: rect(${x},${y},${w},${h})`);
      }
    }
    for (const l of lines) {
      const [x1, y1, x2, y2] = l;
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        if (x < M - 0.5 || x > W - M + 0.5 || y < M - 0.5 || y > H - M + 0.5) {
          probs.push(`超界: line(${x1},${y1})-(${x2},${y2})`);
          break;
        }
      }
    }
    // ② 字压元件（只对【小元件框】查，判据收敛过 4 次）
    const inner = rects.filter(r =>
      !(r[2] > W * 0.70 && r[3] > H * 0.70) && (r[2] < 25.0 && r[3] < 20.0));
    for (const t of texts) {
      const [tx, ty, sz, s] = t;
      for (const r of inner) {
        const [x, y, w, h] = r;
        if (!(x < tx && tx < x + w && y < ty && ty < y + h)) continue;
        const cx = x + w / 2, cy = y + h / 2;
        if (Math.abs(tx - cx) < w * 0.45 && Math.abs(ty - cy) < h * 0.75) continue;
        probs.push(`字压元件: "${s}" 落在小框 rect(${x},${y},${w},${h}) 内但不在中心`);
      }
    }
    return probs;
  }

  /** ⭐ 出图 —— ⚠️ 输出必须跟 Python 版逐字节一致 */
  svg(title = '电气原理图') {
    const body = this.el.join('\n  ');
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0}
 body{background:#e8e8e8;font-family:${FONT};display:flex;justify-content:center;padding:16px}
 .sheet{background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.16);width:min(1500px,96vw)}
 svg{display:block;width:100%;height:auto}
 @media print{body{background:#fff;padding:0;display:block} .sheet{box-shadow:none;width:auto}
   svg{height:285mm;width:auto;max-width:100%}          /* A3横向297mm − 6mm×2 边距 = 285mm */
   @page{size:A3 landscape;margin:6mm}}
</style></head><body>
 <div class="sheet">
 <svg viewBox="0 0 ${W_TXT} ${H_TXT}" xmlns="http://www.w3.org/2000/svg"
      stroke="${INK}" fill="none" stroke-linecap="round" stroke-linejoin="round">
 ${body}
 </svg>
 </div>
</body></html>`;
  }
}

// ══════════════════════════════════════════════════════════
// ⭐ 电加热水箱 / 通用加热柜（对应 Python build_tank）
// ══════════════════════════════════════════════════════════
function build_tank({ heaters = ['EH1', 'EH2'], pumps = [], motors = [],
                      has_level = true, has_temp = true, has_lamp = true,
                      pump = null, phases = 3, uses = null, ctrls = null,
                      loads = null } = {}) {
  if (pump && pumps.length === 0) pumps = [pump];
  const s = new Sheet(phases);
  s.frame();
  s.buses();
  s.qf();

  const npole = (s.phases === 1) ? 1 : 3;
  const nbus = (s.phases === 1) ? 1 : 3;

  // ⭐⭐⭐ 主回路：每个负载占【三根并排竖线】
  // ⭐⭐⭐ 主回路：每个负载占【三根并排竖线】
  //    ⭐⭐ 2026-10-05 修 bug（用户报"风机和排水泵混错了"）：
  //       原来固定按【类型】排（加热 → 泵 → 电机），而点选屏按【他加的先后】显示
  //       → 两边顺序不一致，他看着就像两个负载画混了。
  //       loads 参数 = 有序的 [[类型, 中文用途], ...]，给了就按这个顺序画。
  const seq = loads
    ? loads.map(([k, cn]) => [k, cn])
    : heaters.map(x => ['EH', x])
        .concat(pumps.map(x => ['M', x]))
        .concat(motors.map(x => ['M', x]));
  const R_CAP = maxLoops();
  let nEH = 0, nM = 0;
  seq.forEach(([kind, cn], i) => {
    // ⭐⭐⭐ 2026-10-05 加安全网：超出纸张容量就不画（实测 14 路会冲到 x=415.4，界 410）
    if (i >= R_CAP) return;
    // 代号按顺序编：加热 EH1/EH2…，电机类 M1/M2…
    let label;
    if (kind === 'EH') { nEH++; label = `EH${nEH}`; }
    else { nM++; label = `M${nM}`; }
    const c = s.contactor(TAP_X0 + i * LOAD_PITCH, `KM${i + 1}`, null, npole);
    c.xs.forEach((xo, j) => {
      const xin = xo - KM_OFF;
      const busY = s.busy[npole > 1 ? j : 0];
      s.dot(xin, busY);
      s.line(xin, busY, xin, KM_TOP - 6.0);
    });
    s.load3(c.xs, c.yo, label, kind);
    // ⭐⭐ 每路底下标中文用途（loads 给了就用 loads 里的，否则退回 uses）
    const use = cn || (uses ? uses[i] : null);
    if (use) {
      const mid = (c.xs[0] + c.xs[c.xs.length - 1]) / 2;
      s.text(mid, EH_Y + 26.0, `${i + 1}.${use}`, 2.6, DIM, 'middle');
    }
  });

  // ── 控制回路 ──
  s.text(M + 4.0, CTRL_Y - 8.0, '控制回路', 3.6, INK, 'start', false, true);
  s.term(M + 6.0, CTRL_Y);
  s.line(M + 6.9, CTRL_Y, W - M - 8.0, CTRL_Y, LW_B);
  s.term(M + 6.0, CTRL_N);
  s.line(M + 6.9, CTRL_N, W - M - 8.0, CTRL_N, LW_B);
  s.text(M + 3.0, CTRL_Y + 1.1, 'L', 3.0, INK, 'end', true);
  s.text(M + 3.0, CTRL_N + 1.1, 'N', 3.0, INK, 'end', true);

  const box_y = CTRL_Y + 16.0;

  // ⭐⭐⭐ 控制器件行（动态排布）—— 2026-10-05
  const devs = [];
  if (has_temp) devs.push('温度控制器');
  if (has_level) devs.push('水位控制器');
  for (const c of (ctrls || [])) {
    if (CTRL_DEV[c]) devs.push(c);               // ⭐ 允许重名（电磁阀要 2 个就传两次）
  }

  let x = CTRL_X0;
  const dev_cx = [];
  const seen = {};                                // ⭐ 重名计数 → 电磁阀1 / 电磁阀2
  for (const d of devs) {
    const [w, kind] = CTRL_DEV[d];
    if (x + w > CTRL_LIM) break;                 // 一行放满就停
    seen[d] = (seen[d] || 0) + 1;
    const nSame = devs.filter(z => z === d).length;
    const label = nSame > 1 ? d + seen[d] : d;
    const cx = x + w / 2.0;
    let top, bot;
    if (kind === 'coil') {
      // ⚠️ 引线端点要落在【线圈实际边】上，不能落在方框的 y（差 3mm 被判成断线）
      const cy0 = box_y + 3.0, ch = CTRL_H - 4.0;
      s.coil(cx, cy0, label, w * 0.52, ch, 'right');
      top = cy0; bot = cy0 + ch;
    } else {
      s.ctrl_box(x, box_y, w, CTRL_H, label);
      top = box_y; bot = box_y + CTRL_H;
    }
    s.line(cx, CTRL_Y, cx, top);
    s.dot(cx, CTRL_Y);
    s.line(cx, bot, cx, CTRL_Y + 52.0);
    dev_cx.push(cx);
    x += w + CTRL_GAP;
  }

  if (has_level) {
    s.float_label(dev_cx.length > 1 ? dev_cx[1] + 3.0 : 130.0, CTRL_Y + 44.0, '浮球');
  }

  // SB1 —— 放器件行右边专用位置（原来 max(dev_cx)+40 又被 min(...,300) 截断 → 重叠）
  const sb_x = CTRL_LIM + 14.0;
  s.button(sb_x, CTRL_Y + 20.0, 'SB1');
  s.line(sb_x, CTRL_Y, sb_x, CTRL_Y + 15.0);
  s.dot(sb_x, CTRL_Y);
  s.line(sb_x + 5.4, CTRL_Y + 25.2, sb_x + 5.4, CTRL_Y + 52.0);

  // 线圈（KM1 / KM2）
  const cxa = 81.0, cxb = 250.0;
  s.line(cxa, CTRL_Y + 52.0, cxa, CTRL_Y + 64.0);
  s.coil(cxa, CTRL_Y + 64.0, 'KM1');
  s.line(cxa, CTRL_Y + 76.0, cxa, CTRL_N);
  s.dot(cxa, CTRL_N);
  // ⭐ 公共线起点要覆盖最左边的器件（温控在 65，从 81 起会断）
  const x_l = Math.min(...dev_cx, cxa);
  s.line(x_l, CTRL_Y + 52.0, sb_x + 5.8, CTRL_Y + 52.0);

  s.line(cxb, CTRL_Y + 52.0, cxb, CTRL_Y + 64.0);
  s.coil(cxb, CTRL_Y + 64.0, 'KM2');
  s.line(cxb, CTRL_Y + 76.0, cxb, CTRL_N);
  s.dot(cxb, CTRL_N);

  // 指示灯 —— ⭐ 挪到线圈那一行（器件行动态排布会占满上面一行，会撞）
  if (has_lamp) {
    s.lamp(330.0, CTRL_Y + 70.0, 'HL1');
    s.line(330.0, CTRL_Y + 52.0, 330.0, CTRL_Y + 66.6);
    s.dot(330.0, CTRL_Y + 52.0);
    s.line(330.0, CTRL_Y + 73.4, 330.0, CTRL_N);
    s.dot(330.0, CTRL_N);
    s.line(330.0, CTRL_Y + 52.0, cxb, CTRL_Y + 52.0);
  }
  return s;
}

// ══════════════════════════════════════════════════════════
// ⭐⭐ 实例样板：照父亲【真做过的那台柜】1:1 复刻（9 路）
//     证据 = 安装板手写编号 ⑨高排水 ⑧加热 ⑦小泵 ⑥加热 ⑤水泵 ④加热 ③水泵 ②加热 ①水泵
// ══════════════════════════════════════════════════════════
function build_real_cabinet(name = '多路加热水泵柜（照实物）') {
  const seq = [
    ['M1',  'M',  '水泵'],
    ['EH1', 'EH', '加热'],
    ['M2',  'M',  '水泵'],
    ['EH2', 'EH', '加热'],
    ['M3',  'M',  '水泵'],
    ['EH3', 'EH', '加热'],
    ['M4',  'M',  '小泵'],
    ['EH4', 'EH', '加热'],
    ['M5',  'M',  '高排水'],
  ];
  const s = new Sheet();
  s.frame();
  s.buses();
  s.qf('QF1');

  seq.forEach(([label, kind, cn], i) => {
    const c = s.contactor(TAP_X0 + i * LOAD_PITCH, `KM${i + 1}`);
    c.xs.forEach((pxo, j) => {
      const xin = pxo - KM_OFF;
      s.dot(xin, BUS_Y[j]);
      s.line(xin, BUS_Y[j], xin, KM_TOP - 6.0);
    });
    for (const pxo of c.xs) s.line(pxo, c.yo, pxo, EH_Y - 4.0);
    s.load3(c.xs, c.yo, label, kind);
    const mid = (c.xs[0] + c.xs[c.xs.length - 1]) / 2;
    s.text(mid, EH_Y + 26.0, `${i + 1}.${cn}`, 2.6, DIM, 'middle');
  });

  // ── 控制回路 ──
  s.text(M + 4.0, CTRL_Y - 8.0, '控制回路', 3.6, INK, 'start', false, true);
  s.term(M + 6.0, CTRL_Y);
  s.line(M + 6.9, CTRL_Y, W - M - 8.0, CTRL_Y, LW_B);
  s.term(M + 6.0, CTRL_N);
  s.line(M + 6.9, CTRL_N, W - M - 8.0, CTRL_N, LW_B);
  s.text(M + 3.0, CTRL_Y + 1.1, 'L', 3.0, INK, 'end', true);
  s.text(M + 3.0, CTRL_N + 1.1, 'N', 3.0, INK, 'end', true);

  const box_y = CTRL_Y + 16.0;
  const cx1 = 60.0 + 21.0;
  s.ctrl_box(60.0, box_y, 42.0, 22.0, '温度控制器');
  s.line(cx1, CTRL_Y, cx1, box_y);
  s.dot(cx1, CTRL_Y);
  s.line(cx1, box_y + 22.0, cx1, CTRL_Y + 52.0);
  const cx2 = 130.0 + 21.0;
  s.ctrl_box(130.0, box_y, 42.0, 22.0, '液位控制器');
  s.line(cx2, box_y, cx2, box_y - 9.0);
  s.line(cx2, box_y - 9.0, cx1, box_y - 9.0);
  s.line(cx1, box_y - 9.0, cx1, box_y);
  s.dot(cx1, box_y);
  s.line(cx2, box_y + 22.0, cx2, CTRL_Y + 52.0);
  s.float_label(cx2 + 2.0, CTRL_Y + 44.0, '浮球');

  const cx3 = 205.0 + 22.0;
  s.ctrl_box(205.0, box_y, 44.0, 22.0, '时控开关');
  s.text(227.0, box_y + 26.0, 'KG316T', 2.4, DIM, 'middle', true);
  s.line(cx3, CTRL_Y, cx3, box_y);
  s.dot(cx3, CTRL_Y);
  s.line(cx3, box_y + 22.0, cx3, CTRL_Y + 52.0);

  s.lamp(300.0, CTRL_Y + 28.0, 'HL1');
  s.line(300.0, CTRL_Y, 300.0, CTRL_Y + 24.6);
  s.dot(300.0, CTRL_Y);

  const yy = CTRL_N - 24.0;
  s.line(81.0, CTRL_Y + 52.0, 81.0, yy);
  s.coil(81.0, yy, 'KM1', 7.0, 13.0, 'left');
  s.line(81.0, yy + 13.0, 81.0, CTRL_N);
  s.dot(81.0, CTRL_N);
  s.line(81.0, CTRL_Y + 52.0, 227.0, CTRL_Y + 52.0);

  s.text(M + 5.0, CTRL_N + 10.0, '★ 端子排应贴中文标识', 2.7, INK, 'start');
  s.text(M + 5.0, CTRL_N + 15.0, '★ 安装板上应标注每个回路的用途与编号', 2.7, INK, 'start');
  return s;
}

// ══════════════════════════════════════════════════════════
// ⭐ 星三角启动柜（照父亲实物：TAIKUO AS-3UA10-8 + JS14P）
//    ⚠️ 安全铁律：KM3(星) 必须先断，KM2(三角) 才能合 —— 防相间短路
// ══════════════════════════════════════════════════════════
function build_stardelta({ name = '星三角启动柜', delay_s = 9, kw = 22.0 } = {}) {
  const s = new Sheet();
  s.frame();
  s.buses();
  s.qf('QF1');

  const xs = taps(3);
  const kms = ['KM1', 'KM2', 'KM3'];
  const outs = [];
  xs.forEach((x, i) => {
    const c = s.contactor(x, kms[i], KM_TOP);
    c.xs.forEach((pxo, j) => {
      const xin = pxo - KM_OFF;
      s.dot(xin, BUS_Y[j]);
      s.line(xin, BUS_Y[j], xin, KM_TOP - 6.0);
    });
    for (const pxo of c.xs) s.line(pxo, c.yo, pxo, EH_Y - 6.0);
    outs.push(c);
  });

  // ⭐ 电机接在 KM1 下面
  const p1 = outs[0].xs, y1 = outs[0].yo;
  const mid1 = (p1[0] + p1[p1.length - 1]) / 2;
  const mcy = EH_Y + 6.0, mr = 8.2;
  for (const pxo of p1) {
    const d2 = mr * mr - (pxo - mid1) ** 2;
    const dy = d2 > 0 ? Math.sqrt(d2) : 0.0;
    s.line(pxo, y1, pxo, mcy - dy);
  }
  s.el.push(`<circle cx="${F2(mid1)}" cy="${F2(mcy)}" r="${mr}" fill="none" ` +
            `stroke="${INK}" stroke-width="${LW}"/>`);
  s.text(mid1, mcy + 1.4, 'M', 4.2, INK, 'middle', true);
  s.text(mid1, mcy + mr + 4.5, '3~ 电动机', 2.8, DIM, 'middle');
  s.text(mid1, EH_Y - 10.0, 'U1 V1 W1 电动机启动', 2.8, DIM, 'middle');

  // ⭐ KM2 → W2 U2 V2；KM3 → 短接成星点
  const p2 = outs[1].xs, p3 = outs[2].xs;
  const ybar = EH_Y + 4.0;
  for (const pxo of p2) s.line(pxo, ybar - 10.0, pxo, ybar);
  s.line(p2[0], ybar, p2[p2.length - 1], ybar, LW_B);
  s.text((p2[0] + p2[p2.length - 1]) / 2, ybar + 5.0, 'W2 U2 V2 电动机运行', 2.8, DIM, 'middle');
  for (const pxo of p3) s.line(pxo, ybar - 10.0, pxo, ybar);
  s.line(p3[0], ybar, p3[p3.length - 1], ybar, LW_B);
  s.text((p3[0] + p3[p3.length - 1]) / 2, ybar + 5.0, '短接（星点）', 2.8, DIM, 'middle');

  s.text(xs[0], KM_TOP - 17.0, '主接触器', 2.9, RED, 'middle');
  s.text(xs[1], KM_TOP - 17.0, '△ 三角运行', 2.9, RED, 'middle');
  s.text(xs[2], KM_TOP - 17.0, 'Y 星启动', 2.9, RED, 'middle');

  s.text(W - M - 8.0, KM_TOP + 44.0, '★ 联锁：KM3(星) 必须先断，', 3.0, RED, 'end');
  s.text(W - M - 8.0, KM_TOP + 49.0, '   KM2(三角) 才能合闸', 3.0, RED, 'end');
  s.text(W - M - 8.0, KM_TOP + 54.0, '   （电气 + 机械互锁，防相间短路）', 2.8, RED, 'end');

  // ── 控制回路 ──
  s.text(M + 4.0, CTRL_Y - 8.0, '控制回路', 3.6, INK, 'start', false, true);
  s.term(M + 6.0, CTRL_Y);
  s.line(M + 6.9, CTRL_Y, W - M - 8.0, CTRL_Y, LW_B);
  s.term(M + 6.0, CTRL_N);
  s.line(M + 6.9, CTRL_N, W - M - 8.0, CTRL_N, LW_B);
  s.text(M + 3.0, CTRL_Y + 1.1, 'L', 3.0, INK, 'end', true);
  s.text(M + 3.0, CTRL_N + 1.1, 'N', 3.0, INK, 'end', true);

  s.ctrl_box(52.0, CTRL_Y + 16.0, 26.0, 20.0, '热过载');
  s.line(65.0, CTRL_Y, 65.0, CTRL_Y + 16.0);
  s.dot(65.0, CTRL_Y);

  s.ctrl_box(150.0, CTRL_Y + 16.0, 30.0, 20.0, '时间继电器');
  s.text(165.0, CTRL_Y + 14.7, `KT  ${delay_s}s`, 2.8, RED, 'middle', true);
  s.line(165.0, CTRL_Y, 165.0, CTRL_Y + 16.0);
  s.dot(165.0, CTRL_Y);

  s.button(238.0, CTRL_Y + 20.0, 'SB2');
  s.line(238.0, CTRL_Y, 238.0, CTRL_Y + 15.0);
  s.dot(238.0, CTRL_Y);
  s.line(243.4, CTRL_Y + 25.2, 243.4, CTRL_Y + 52.0);

  [[65.0, 'KM1'], [150.0, 'KM3'], [238.0, 'KM2']].forEach(([cx, nm], i) => {
    const yy = CTRL_N - 24.0;
    s.line(cx, CTRL_Y + 52.0, cx, yy);
    s.coil(cx, yy, nm, 7.0, 13.0, (i % 2) ? 'left' : 'right');
    s.line(cx, yy + 13.0, cx, CTRL_N);
    s.dot(cx, CTRL_N);
  });
  s.line(65.0, CTRL_Y + 52.0, 243.4, CTRL_Y + 52.0);
  s.text(M + 5.0, CTRL_N + 12.0,
         `★ 适用电机功率参考：${F0(kw)} kW 级（实际以铭牌为准）`, 2.9, DIM, 'start');
  return s;
}

// ══════════════════════════════════════════════════════════
// ⭐ 变频调速柜（照父亲实物：西门子 SINAMICS 3AC 400V + 3RV）
// ══════════════════════════════════════════════════════════
function build_vfd({ name = '变频调速柜', kw = 1.3, has_pot = true } = {}) {
  const s = new Sheet();
  s.frame();
  s.buses();
  s.qf('QF1');

  const x0 = taps(1)[0] - 42.0;
  s.text(x0, KM_TOP - 13.0, '3RV 电机保护', 2.9, RED, 'middle');
  const c3 = s.contactor(x0, '3RV', KM_TOP);
  const pxs = c3.xs, yo3 = c3.yo;
  pxs.forEach((pxo, j) => {
    const xin = pxo - KM_OFF;
    s.dot(xin, BUS_Y[j]);
    s.line(xin, BUS_Y[j], xin, KM_TOP - 6.0);
  });

  const vx = x0 + 30.0, vy = KM_TOP - 8.0, vw = 62.0, vh = 74.0;
  s.rect(vx, vy, vw, vh, LW_B);
  s.text(vx + vw / 2, vy + 7.0, '变频器', 4.0, INK, 'middle');
  s.text(vx + vw / 2, vy + 12.0, 'SINAMICS', 2.7, DIM, 'middle', true);
  s.text(vx + vw / 2, vy + 16.0, `3AC 400V  ${PYF(kw)}kW`, 2.7, DIM, 'middle', true);

  pxs.forEach((pxo, j) => {
    const yy = vy + 34.0 + j * 5.0;
    s.line(pxo, yo3, pxo, yy);
    s.line(pxo, yy, vx, yy);
  });
  s.text(vx - 2.0, vy + 32.5, 'U1 V1 W1', 2.6, DIM, 'end', true);
  const mx = vx + vw + 34.0;
  s.line(vx + vw, vy + 40.0, mx - 8.5, vy + 40.0);
  s.text(vx + vw + 2.0, vy + 38.5, 'U V W', 2.6, DIM, 'start', true);
  s.el.push(`<circle cx="${F2(mx)}" cy="${F2(vy + 40.0)}" r="8.5" fill="none" ` +
            `stroke="${INK}" stroke-width="${LW}"/>`);
  s.text(mx, vy + 41.4, 'M', 4.2, INK, 'middle', true);
  s.text(mx, vy + 54.0, '3~ 电动机', 2.8, DIM, 'middle');
  s.text(mx, vy + 60.0, '★ 变频器到电机必须用屏蔽电缆', 2.6, RED, 'middle');

  const ty0 = vy + vh - 26.0;
  s.text(vx + 3.0, ty0, '模拟量：10V AI1 AI2 AO1 0V', 2.4, INK, 'start', true);
  s.text(vx + 3.0, ty0 + 4.4, '        P+ N-', 2.4, INK, 'start', true);
  s.text(vx + 3.0, ty0 + 8.8, '数字入：DI1 DI2 DI3 DI4 DI C', 2.4, INK, 'start', true);
  s.text(vx + 3.0, ty0 + 13.2, '数字出：DO1+ DO1- DO2 NC', 2.4, INK, 'start', true);

  const ty = vy + vh + 7.0;
  s.text(vx, ty, '★ 模拟量信号线必须用屏蔽线，屏蔽层单端接地', 2.7, RED, 'start');
  s.text(vx, ty + 5.0, '★ 变频器到电机必须用屏蔽电缆', 2.7, RED, 'start');

  if (has_pot) {
    const px = vx - 8.0;
    s.line(px, CTRL_Y, px, CTRL_Y + 8.0);
    s.dot(px, CTRL_Y);
    s.el.push(`<rect x="${F2(px - 3.5)}" y="${F2(CTRL_Y + 8.0)}" width="7.0" height="6.0" ` +
              `fill="none" stroke="${INK}" stroke-width="${LW}"/>`);
    s.line(px, CTRL_Y + 14.0, px, CTRL_N);
    s.dot(px, CTRL_N);
    s.text(px - 5.0, CTRL_Y + 12.5, '电位器 10k', 2.5, DIM, 'end');
  }

  s.text(W - M - 8.0, KM_TOP + 30.0, '★ 变频器要点：', 3.0, RED, 'end');
  s.text(W - M - 8.0, KM_TOP + 35.0, '① 输出侧严禁接电容/进相器', 2.7, RED, 'end');
  s.text(W - M - 8.0, KM_TOP + 39.5, '② 加减速时间按负载整定', 2.7, RED, 'end');
  s.text(W - M - 8.0, KM_TOP + 44.0, '③ 长电缆要加输出电抗器', 2.7, RED, 'end');

  s.text(M + 4.0, CTRL_Y - 8.0, '控制回路', 3.6, INK, 'start', false, true);
  s.term(M + 6.0, CTRL_Y);
  s.line(M + 6.9, CTRL_Y, W - M - 8.0, CTRL_Y, LW_B);
  s.term(M + 6.0, CTRL_N);
  s.line(M + 6.9, CTRL_N, W - M - 8.0, CTRL_N, LW_B);
  s.text(M + 3.0, CTRL_Y + 1.1, 'L', 3.0, INK, 'end', true);
  s.text(M + 3.0, CTRL_N + 1.1, 'N', 3.0, INK, 'end', true);

  s.button(80.0, CTRL_Y + 22.0, 'SB1');
  s.line(80.0, CTRL_Y, 80.0, CTRL_Y + 17.0);
  s.dot(80.0, CTRL_Y);
  s.line(85.4, CTRL_Y + 27.2, 85.4, CTRL_N);
  s.dot(85.4, CTRL_N);
  s.ctrl_box(150.0, CTRL_Y + 16.0, 44.0, 22.0, '变频器控制端');
  s.line(172.0, CTRL_Y, 172.0, CTRL_Y + 16.0);
  s.dot(172.0, CTRL_Y);
  s.line(172.0, CTRL_Y + 38.0, 172.0, CTRL_N);
  s.dot(172.0, CTRL_N);
  s.lamp(270.0, CTRL_Y + 28.0, 'HL1');
  s.line(270.0, CTRL_Y, 270.0, CTRL_Y + 24.6);
  s.dot(270.0, CTRL_Y);
  s.line(270.0, CTRL_Y + 31.4, 270.0, CTRL_N);
  s.dot(270.0, CTRL_N);

  s.line(vx + vw / 2, vy + vh, vx + vw / 2, vy + vh + 5.0, LW);
  s.ground(vx + vw / 2, vy + vh + 5.0);
  return s;
}

// ══════════════════════════════════════════════════════════
// ⭐ 制冷柜 —— 照【甲方原文】画（滨州天虹电器 采购技术清单）
// ══════════════════════════════════════════════════════════
function build_refrig({ name = '制冷电控柜', kw = 4.0 } = {}) {
  const s = new Sheet();
  s.frame();
  s.buses();
  s.qf('QF1');

  const x0 = taps(1)[0] - 40.0;
  const c = s.contactor(x0, 'KM1', KM_TOP);
  const pxs = c.xs, yo = c.yo;
  pxs.forEach((pxo, j) => {
    const xin = pxo - KM_OFF;
    s.dot(xin, BUS_Y[j]);
    s.line(xin, BUS_Y[j], xin, KM_TOP - 6.0);
  });
  for (const pxo of pxs) s.line(pxo, yo, pxo, EH_Y - 6.0, LW);

  const xmid = (pxs[0] + pxs[pxs.length - 1]) / 2;
  s.rect(pxs[0] - 3.5, EH_Y - 6.0, (pxs[pxs.length - 1] - pxs[0]) + 7.0, 10.0);
  s.text(xmid, EH_Y, '综合保护器', 2.3, INK, 'middle');
  s.line(xmid, EH_Y + 4.0, xmid, EH_Y + 10.0);
  s.el.push(`<circle cx="${F2(xmid)}" cy="${F2(EH_Y + 18.0)}" r="8.5" fill="none" ` +
            `stroke="${INK}" stroke-width="${LW}"/>`);
  s.text(xmid, EH_Y + 19.4, 'M', 4.2, INK, 'middle', true);
  s.text(xmid, EH_Y + 31.0, `压缩机 3~ ${kw.toFixed(1)}kW`, 2.8, DIM, 'middle');

  s.text(pxs[pxs.length - 1] + 22.0, EH_Y - 14.0, '制冷阀件：', 2.9, INK, 'start');
  s.text(pxs[pxs.length - 1] + 22.0, EH_Y - 9.0, '电磁阀 YV1', 2.7, DIM, 'start', true);
  s.text(pxs[pxs.length - 1] + 22.0, EH_Y - 4.0, '膨胀阀', 2.7, DIM, 'start');

  s.text(M + 4.0, CTRL_Y - 8.0, '控制回路', 3.6, INK, 'start', false, true);
  s.term(M + 6.0, CTRL_Y);
  s.line(M + 6.9, CTRL_Y, W - M - 8.0, CTRL_Y, LW_B);
  s.term(M + 6.0, CTRL_N);
  s.line(M + 6.9, CTRL_N, W - M - 8.0, CTRL_N, LW_B);
  s.text(M + 3.0, CTRL_Y + 1.1, 'L', 3.0, INK, 'end', true);
  s.text(M + 3.0, CTRL_N + 1.1, 'N', 3.0, INK, 'end', true);

  [[52.0, 34.0, '数显温控器'], [112.0, 30.0, '化霜定时器'],
   [172.0, 30.0, '综合保护器'], [232.0, 30.0, '相序保护']].forEach(([bx, bw, nm]) => {
    s.ctrl_box(bx, CTRL_Y + 16.0, bw, 20.0, nm);
    s.line(bx + bw / 2, CTRL_Y, bx + bw / 2, CTRL_Y + 16.0);
    s.dot(bx + bw / 2, CTRL_Y);
    s.line(bx + bw / 2, CTRL_Y + 36.0, bx + bw / 2, CTRL_Y + 52.0);
  });
  s.ctrl_box(300.0, CTRL_Y + 16.0, 34.0, 20.0, '温度显示');
  s.line(317.0, CTRL_Y, 317.0, CTRL_Y + 16.0);
  s.dot(317.0, CTRL_Y);

  const yy = CTRL_N - 24.0;
  s.line(69.0, CTRL_Y + 52.0, 69.0, yy);
  s.coil(69.0, yy, 'KM1');
  s.line(69.0, yy + 13.0, 69.0, CTRL_N);
  s.dot(69.0, CTRL_N);
  s.line(69.0, CTRL_Y + 52.0, 247.0, CTRL_Y + 52.0);

  s.text(M + 5.0, CTRL_N + 12.0,
         '★ 本图控制项照【滨州天虹电器 采购技术清单】原文：全自动数显温控、化霜、' +
         '电动机综合保护器、相序保护装置 + 温度显示', 2.6, DIM, 'start');
  return s;
}

// ══════════════════════════════════════════════════════════
// ⭐⭐ 油烟净化一体柜 —— ⭐ 混装：380V 三相风机 + 220V 高压静电
//    原文出处：山东华杰厨业 采购技术清单
// ══════════════════════════════════════════════════════════
function build_purifier({ name = '油烟净化一体柜', fan_kw = 1.5 } = {}) {
  const s = new Sheet();
  s.frame();
  s.buses();
  s.qf('QF1');

  // ══ 第一路：三相 380V → 风机（变频驱动）══
  const x1 = taps(2)[0];
  const c1 = s.contactor(x1, 'KM1', KM_TOP);
  const pxs = c1.xs, yo1 = c1.yo;
  pxs.forEach((pxo, j) => {
    const xin = pxo - KM_OFF;
    s.dot(xin, BUS_Y[j]);
    s.line(xin, BUS_Y[j], xin, KM_TOP - 6.0);
  });
  for (const pxo of pxs) s.line(pxo, yo1, pxo, EH_Y - 6.0);
  const xmid1 = (pxs[0] + pxs[pxs.length - 1]) / 2;
  s.rect(pxs[0] - 4.0, EH_Y - 6.0, (pxs[pxs.length - 1] - pxs[0]) + 8.0, 22.0, LW_B);
  s.text(xmid1, EH_Y - 0.5, '变频器', 2.7, INK, 'middle');
  s.text(xmid1, EH_Y + 4.5, 'U V W', 2.4, DIM, 'middle', true);
  s.text(xmid1, EH_Y + 6.0, 'M', 3.4, INK, 'end', true);
  s.line(xmid1, EH_Y + 16.0, xmid1, EH_Y + 23.0);
  s.el.push(`<circle cx="${F2(xmid1)}" cy="${F2(EH_Y + 31.5)}" r="8.5" fill="none" ` +
            `stroke="${INK}" stroke-width="${LW}"/>`);
  s.text(xmid1, EH_Y + 32.9, 'M', 4.2, INK, 'middle', true);
  s.text(xmid1, EH_Y + 45.0, `风机 3~ ${PYF(fan_kw)}kW`, 2.8, DIM, 'middle');

  // ══ 第二路：220V 单相 → 高压电源箱 → 静电电场 ══
  const x2 = taps(2)[1];
  s.line(x2, BUS_Y[0], x2, BUS_Y[0] + 8.0);
  s.line(x2, BUS_Y[0] + 8.0, BUS_Y[3], BUS_Y[0] + 8.0, LW);
  s.line(BUS_Y[3], BUS_Y[0] + 8.0, x2 - 12.0, BUS_Y[0] + 8.0, LW);
  s.dot(x2, BUS_Y[0]);
  s.dot(BUS_Y[3], BUS_Y[0] + 8.0);
  s.text(x2 + 2.0, BUS_Y[0] + 6.5, 'L / N  220V', 2.5, DIM, 'start', true);
  s.rect(x2 - 26.0, KM_TOP - 4.0, 52.0, 30.0, LW_B);
  s.text(x2, KM_TOP + 2.0, '高压电源', 3.0, INK, 'middle');
  s.text(x2, KM_TOP + 7.0, '240W×2', 2.5, DIM, 'middle', true);
  s.text(x2, KM_TOP + 12.0, '12~20kV', 2.5, RED, 'middle', true);
  s.line(x2, BUS_Y[0] + 8.0, x2, KM_TOP - 4.0, LW);
  s.rect(x2 - 30.0, KM_TOP + 32.0, 60.0, 26.0, LW_B);
  s.text(x2, KM_TOP + 42.0, '静电电场', 3.2, INK, 'middle');
  s.text(x2, KM_TOP + 48.0, '全铝电场', 2.5, DIM, 'middle');
  s.text(x2, KM_TOP + 53.5, '净化效率 ≥96%', 2.5, DIM, 'middle');
  s.line(x2, KM_TOP + 26.0, x2, KM_TOP + 32.0, LW);
  s.line(x2 - 4.0, KM_TOP + 32.0, x2 + 4.0, KM_TOP + 32.0, LW * 1.3, RED);

  s.text(W - M - 8.0, KM_TOP + 4.0, '⚠ 高压危险（12~20kV）', 3.4, RED, 'end');
  s.text(W - M - 8.0, KM_TOP + 10.0, '① 断电后必须放电再开门（电场存电）', 2.8, RED, 'end');
  s.text(W - M - 8.0, KM_TOP + 15.0, '② 电场与柜体间距按厂家要求，防爬电', 2.8, RED, 'end');
  s.text(W - M - 8.0, KM_TOP + 20.0, '③ 高压电源必须独立 220V 供电，不跟风机共', 2.8, RED, 'end');
  s.text(W - M - 8.0, KM_TOP + 25.0, '④ 触摸屏/芯片控制须做【智能灭弧】', 2.8, RED, 'end');

  s.text(M + 4.0, CTRL_Y - 8.0, '控制回路', 3.6, INK, 'start', false, true);
  s.term(M + 6.0, CTRL_Y);
  s.line(M + 6.9, CTRL_Y, W - M - 8.0, CTRL_Y, LW_B);
  s.term(M + 6.0, CTRL_N);
  s.line(M + 6.9, CTRL_N, W - M - 8.0, CTRL_N, LW_B);
  s.text(M + 3.0, CTRL_Y + 1.1, 'L', 3.0, INK, 'end', true);
  s.text(M + 3.0, CTRL_N + 1.1, 'N', 3.0, INK, 'end', true);

  [[46.0, 44.0, '芯片智能控制', '主控板'], [110.0, 40.0, '触摸屏', '一键控制'],
   [172.0, 40.0, '智能灭弧', '高压保护'], [234.0, 40.0, '变频器控制端', '风机调速']]
    .forEach(([bx, bw, nm, sub]) => {
      s.ctrl_box(bx, CTRL_Y + 16.0, bw, 22.0, nm);
      s.text(bx + bw / 2, CTRL_Y + 40.0, sub, 2.4, DIM, 'middle');
      s.line(bx + bw / 2, CTRL_Y, bx + bw / 2, CTRL_Y + 16.0);
      s.dot(bx + bw / 2, CTRL_Y);
      s.line(bx + bw / 2, CTRL_Y + 38.0, bx + bw / 2, CTRL_Y + 52.0);
    });

  s.lamp(310.0, CTRL_Y + 28.0, 'HL1');
  s.line(310.0, CTRL_Y, 310.0, CTRL_Y + 24.6);
  s.dot(310.0, CTRL_Y);
  s.line(310.0, CTRL_Y + 31.4, 310.0, CTRL_Y + 52.0);
  s.dot(310.0, CTRL_Y + 52.0);

  const yy = CTRL_N - 24.0;
  s.line(68.0, CTRL_Y + 52.0, 68.0, yy);
  s.coil(68.0, yy, 'KM1');
  s.line(68.0, yy + 13.0, 68.0, CTRL_N);
  s.dot(68.0, CTRL_N);
  s.line(68.0, CTRL_Y + 52.0, 254.0, CTRL_Y + 52.0);
  s.line(310.0, CTRL_Y + 52.0, 250.0, CTRL_Y + 52.0);

  s.text(M + 5.0, CTRL_N + 12.0,
         '★ 本图照【山东华杰厨业 采购技术清单】原文：芯片智能控制·触摸屏一键控制·' +
         '风机 1.5KW/380V·高压电源 240W/220V×2·高压输出 12-20Kv·智能灭弧', 2.6, DIM, 'start');
  return s;
}

/**
 * ⭐ 派发器 —— compare.js 用它跟基准对比
 * kind + params 跟 baseline/cases.json 里的字段一一对应
 */
function build(kind, p, title) {
  switch (kind) {
    case 'tank':
      return build_tank({ heaters: p.heaters, pumps: p.pumps, motors: p.motors,
                          has_level: p.has_level, has_temp: p.has_temp,
                          has_lamp: p.has_lamp, phases: p.phases,
                          uses: p.uses || null, ctrls: p.ctrls || null,
                          loads: p.loads || null }).svg(title);
    case 'real_cabinet':
      return build_real_cabinet().svg(title);
    case 'stardelta':
      return build_stardelta(p).svg(title);
    case 'vfd':
      return build_vfd(p).svg(title);
    case 'refrig':
      return build_refrig(p).svg(title);
    case 'purifier':
      return build_purifier(p).svg(title);
    default:
      throw new Error(`还没翻译: ${kind}`);
  }
}

// ══════════════════════════════════════════════════════════
// ⭐⭐ 连通性 + 相间短路自检（从 .tmp/check_wiring.py 搬过来）
//    为什么要有：2026-10-05 实测抓到过【相间短路】和一大批【断线】——
//    光看 selfcheck()（只查超界/字压元件）根本发现不了。
// ══════════════════════════════════════════════════════════
const EPS_W = 0.6;

function parseGeom(el) {
  const lines = [], rects = [], circles = [], dots = [];
  for (const e of el) {
    let m = e.match(/^<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/);
    if (m) { lines.push(m.slice(1, 5).map(Number)); continue; }
    m = e.match(/^<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/);
    if (m) { rects.push(m.slice(1, 5).map(Number)); continue; }
    m = e.match(/^<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/);
    if (m) {
      const [cx, cy, r] = m.slice(1, 4).map(Number);
      circles.push([cx, cy, r]);
      // ⭐ T 接点 = 青色实心小圆（r<1.2）；母线端子是空心（stroke 有值）
      if (r < 1.2 && e.includes('stroke="none"')) dots.push([cx, cy]);
    }
  }
  return { lines, rects, circles, dots };
}

/** 点是否落在线段上（⭐ 必须支持斜线，否则开关刀口全被误报成断线） */
function onSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return Math.abs(px - x1) <= EPS_W && Math.abs(py - y1) <= EPS_W;
  const t = ((px - x1) * dx + (py - y1) * dy) / L2;
  if (t < -0.02 || t > 1.02) return false;
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy) <= EPS_W;
}

/** ⭐ 找【悬空端点】（= 断线） */
function findDangling(sheet) {
  const { lines, rects, circles } = parseGeom(sheet.el);
  const W_ = W, H_ = H, M_ = M;
  const key = p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const ends = new Map();
  lines.forEach((l, i) => {
    for (const p of [[l[0], l[1]], [l[2], l[3]]]) {
      const k = key(p);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(i);
    }
  });

  const bad = [];
  lines.forEach((l, i) => {
    const [x1, y1, x2, y2] = l;
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      const k = key([px, py]);
      // ① 跟别的线端点重合
      if ((ends.get(k) || []).length > 1) continue;
      // ② ⭐ 开关刀口：别的线端点跟它同 x 或同 y 且距离 < 4mm（QF 斜刀/KM 触点抬起的正常断口）
      let near = false;
      for (const [ek, lst] of ends) {
        if (lst.length === 1 && lst[0] === i) continue;
        const [ex, ey] = ek.split(',').map(Number);
        const d = Math.hypot(px - ex, py - ey);
        if (d < 4.0 && d > 1e-6 && (Math.abs(px - ex) < 0.8 || Math.abs(py - ey) < 0.8)) { near = true; break; }
      }
      if (near) continue;
      // ③ 落在别的线中段（T 接，含斜线）
      let hit = false;
      for (let j = 0; j < lines.length; j++) {
        if (j === i) continue;
        if (onSeg(px, py, lines[j][0], lines[j][1], lines[j][2], lines[j][3])) { hit = true; break; }
      }
      if (hit) continue;
      // ④ 落在元件框里或边上 / 圆圈里或边上
      for (const [rx, ry, rw, rh] of rects) {
        if (rw > W_ * 0.70 && rh > H_ * 0.70) continue;
        if (px >= rx - EPS_W && px <= rx + rw + EPS_W &&
            py >= ry - EPS_W && py <= ry + rh + EPS_W) { hit = true; break; }
      }
      if (hit) continue;
      for (const [cx, cy, r] of circles) {
        if (Math.hypot(px - cx, py - cy) <= r + 1.4) { hit = true; break; }
      }
      if (hit) continue;
      // ⑤ 母线端点 / 图框边 —— 正常悬空
      if (px <= M_ + 1.0 || px >= W_ - M_ - 1.0) continue;
      if (Math.abs(y1 - y2) < 1e-6 && Math.abs(x2 - x1) > 0.55 * W_) continue;
      bad.push({ x: px, y: py, line: l });
    }
  });
  return bad;
}

/** ⭐⭐ 相间短路：一根竖线【通过 T 接点】接到 ≥2 根相线 */
function findShorts(sheet) {
  const { lines, dots } = parseGeom(sheet.el);
  const busy = [BUS_Y[0], BUS_Y[1], BUS_Y[2]];
  const bad = [];
  for (const [x1, y1, x2, y2] of lines) {
    if (Math.abs(x1 - x2) > 0.1) continue;                 // 只看竖线
    if (Math.abs(y2 - y1) < 0.5) continue;
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    const conn = [];
    for (const by of busy) {
      if (!(lo - 0.4 <= by && by <= hi + 0.4)) continue;
      if (dots.some(([dx, dy]) => Math.abs(dx - x1) < 0.6 && Math.abs(dy - by) < 0.6)) conn.push(by);
    }
    if (conn.length >= 2) bad.push({ x: x1, from: lo, to: hi, buses: conn });
  }
  return bad;
}

/** ⭐ 一次跑完三个检查，返回人话清单 */
function checkAll(sheet) {
  const out = [];
  for (const p of sheet.selfcheck()) out.push(p);
  const dg = findDangling(sheet);
  if (dg.length) out.push(`断线: ${dg.length} 个悬空端点（第一个在 ${dg[0].x.toFixed(1)}, ${dg[0].y.toFixed(1)}）`);
  const sh = findShorts(sheet);
  if (sh.length) out.push(`🔴 相间短路: ${sh.length} 处！`);
  return out;
}

// ⭐ 双栖导出：Node 里 require 得到，浏览器里挂 window.RefDraw
//    （compare.js 用 Node 跑；单文件网页用浏览器跑 —— 同一份代码）
const _API = { Sheet, build, build_tank, build_real_cabinet, build_stardelta,
               build_vfd, build_refrig, build_purifier, W, H, M, LW, LW_B,
               INK, RED, CYAN, DIM, FONT, MONO, BUS_Y, KM_TOP, EH_Y, CTRL_Y,
               CTRL_N, BUS_X0, QF_X, KM_OFF, TAP_X0, TAP_X1, POLE_GAP,
               POLE_SPAN, LOAD_GAP, LOAD_PITCH, F2, F0, PYF, maxLoops,
               loadXs, taps, findDangling, findShorts, checkAll, ctrlCapacity,
               // ⭐ 把"合法取值表"暴露出去 —— 桥/接口层才能拒绝瞎编的入参
               //   （不暴露的话，瞎编的器件会被静默画成电机圆圈 = 静默失败）
               CTRL_DEV, CTRL_ORDER, LOAD_CATS: ['EH', 'M'],
               CABINET_KINDS: ['tank', 'real_cabinet', 'stardelta',
                               'vfd', 'refrig', 'purifier'] };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _API;
}
if (typeof window !== 'undefined') {
  window.RefDraw = _API;
}
