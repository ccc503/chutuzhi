# -*- coding: utf-8 -*-
"""出图纸 PWA 图标 —— 画一个"电气原理图"意象：三条母线 + 三路下垂 + 三个负载圆

用法： python make_icons.py
输出： D:\智库\FDE\cad-app\v4\pwa\icon-{192,512,180,maskable-512}.png
"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image, ImageDraw  # noqa: E402

OUT = r'D:\智库\FDE\cad-app\v4\pwa'
os.makedirs(OUT, exist_ok=True)

BG = (0x16, 0x17, 0x1a, 255)      # 跟网页深色主题一致
PAPER = (0x1f, 0x21, 0x26, 255)
BUS = (0x6a, 0x6f, 0x79, 255)     # 母线灰
ACC = (0xc9, 0x8b, 0x8b, 255)     # 强调色（跟界面的按钮同色）
ACC2 = (0x7f, 0xb3, 0xa6, 255)    # 青色（跟 T 接点同色）

S = 4                              # 超采样倍数


def draw_icon(size: int, pad_ratio: float = 0.14) -> Image.Image:
    """pad_ratio: maskable 图标要留更多边（系统会裁圆/切方）。"""
    n = size * S
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # 圆角方底（maskable 用整块方底，因为系统自己会裁）
    r = int(n * (0.22 if pad_ratio <= 0.14 else 0.0))
    if r > 0:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=r, fill=BG)
    else:
        d.rectangle([0, 0, n - 1, n - 1], fill=BG)

    # 内层"纸"
    m = int(n * pad_ratio)
    d.rounded_rectangle([m, m, n - m, n - m], radius=int(n * 0.12), fill=PAPER)

    # ── 图形区（在纸里再缩一圈）
    x0 = m + int(n * 0.10)
    x1 = n - m - int(n * 0.10)
    y0 = m + int(n * 0.14)

    lw = max(2, int(n * 0.022))            # 线宽
    ys = [y0 + int(n * 0.10) * i for i in range(3)]   # 三条母线

    for y in ys:
        d.line([x0, y, x1, y], fill=BUS, width=lw)

    # 三路下垂：从 L1 / L2 / L3 各引一根
    drops = [(0, 0.22), (1, 0.22), (2, 0.22)]
    xs = [x0 + int((x1 - x0) * f) for f in (0.20, 0.50, 0.80)]
    ybot = m + int((n - 2 * m) * 0.78)
    for (bus_i, _), x in zip(drops, xs):
        d.line([x, ys[bus_i], x, ybot], fill=ACC, width=lw)
        d.ellipse([x - lw // 2, ys[bus_i] - lw // 2, x + lw // 2, ys[bus_i] + lw // 2], fill=ACC2)

    # 三个负载圆（底下）
    rad = int(n * 0.062)
    for x in xs:
        d.ellipse([x - rad, ybot - rad, x + rad, ybot + rad], outline=ACC, width=lw)

    return im.resize((size, size), Image.LANCZOS)


for size in (192, 512, 180):
    p = os.path.join(OUT, f'icon-{size}.png')
    draw_icon(size).save(p, 'PNG', optimize=True)
    print(f'  ✅ icon-{size}.png   {os.path.getsize(p):,} B')

p = os.path.join(OUT, 'icon-maskable-512.png')
draw_icon(512, pad_ratio=0.24).save(p, 'PNG', optimize=True)
print(f'  ✅ icon-maskable-512.png   {os.path.getsize(p):,} B')
