# -*- coding: utf-8 -*-
"""生成一张"扫码装到手机"的图 —— 直接发微信给父亲，他拿相机扫一下就行。

用法： python make_pwa_qr.py [网址]
输出： 桌面\\出图纸-装上手机.png  +  .inbox\\pwa_qr.png
"""
import os
import shutil
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

URL = sys.argv[1] if len(sys.argv) > 1 else 'https://ccc503.github.io/chutuzhi/'
OUT1 = r'D:\智库\FDE\.inbox\pwa_qr.png'
OUT2 = r'C:\Users\Administrator\Desktop\出图纸-装上手机.png'

W = 1000
BG = (0x16, 0x17, 0x1a)
CARD = (0x1f, 0x21, 0x26)
LINE = (0x33, 0x36, 0x3d)
TX = (0xe9, 0xea, 0xec)
TX2 = (0x9a, 0xa0, 0xaa)
AC = (0xc9, 0x8b, 0x8b)
OKC = (0x7f, 0xb3, 0xa6)
WARN = (0xd8, 0xc0, 0x8a)

FONTS = [r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\msyhbd.ttc',
         r'C:\Windows\Fonts\simhei.ttf', r'C:\Windows\Fonts\simsun.ttc']


def F(size, bold=False):
    order = ([FONTS[1], FONTS[2]] if bold else []) + FONTS
    for p in order:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def make_qr(text, box=14, border=3):
    enc = cv2.QRCodeEncoder_create()
    m = enc.encode(text)
    # ⚠️⚠️ encode() 出来的矩阵【已经是 0 / 255】，不是 0/1！
    #     我第一版写成 `np.array(m) * 255` → 变成 0/1 → 整张码几乎全黑 → 扫不出来。
    #     （判据：`np.unique(np.array(m))` 输出 [0 255] 就说明不能再乘了）
    arr = np.array(m, dtype=np.uint8)
    if border:
        arr = np.pad(arr, border, constant_values=255)
    img = Image.fromarray(arr).convert('L')
    # ⚠️ 只能用 NEAREST —— 黑白方块用 LANCZOS 缩放着色会糊成灰 → 扫码器认不出来
    return img.resize((img.width * box, img.height * box), Image.NEAREST).convert('RGB')


def qr_sized(text, target=380):
    """挑一个最接近目标尺寸的整数倍率，绝不事后缩放。"""
    best = None
    for box in range(3, 30):
        img = make_qr(text, box=box, border=3)
        if best is None or abs(img.width - target) < abs(best.width - target):
            best = img
        if img.width > target * 1.6:
            break
    return best


qr = qr_sized(URL, 380)
qs = qr.width

H = qs + 898  # ⚠️ 必须跟着下面的卡片布局一起算：最后一张卡底 = QY(156)+QCARD_H(qs+186)+36+130+300 = qs+1198          # 版面高度跟着二维码实际尺寸走
im = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(im)


def card(x0, y0, x1, y1, fill=CARD, outline=LINE, r=18):
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill, outline=outline, width=2)


# ── 标题（⚠️ 别用 emoji —— msyh 字体里没有，会渲染成空心方块）
d.text((56, 44), '出图纸 · 装到手机', font=F(40, True), fill=TX)
d.text((56, 104), '电脑这次不用开 —— 这是装在【他自己手机】上的版本', font=F(22), fill=TX2)

# ── 二维码卡
QY = 156
QCARD_H = qs + 186
card(56, QY, W - 56, QY + QCARD_H)
qx = (W - qs) // 2
im.paste(qr, (qx, QY + 30))
ty = QY + 30 + qs
d.text((W // 2, ty + 26), '手机相机对着这个码扫', font=F(26, True), fill=TX, anchor='mm')
d.text((W // 2, ty + 66), '或者把这图发微信给他、长按识别', font=F(20), fill=TX2, anchor='mm')
d.text((W // 2, ty + 112), '扫完点「安装应用 / 添加到主屏幕」', font=F(22, True), fill=OKC, anchor='mm')

# ── 网址
y = QY + QCARD_H + 36
card(56, y, W - 56, y + 104)
d.text((84, y + 18), '手机打开的就是这个网址', font=F(20), fill=TX2)
d.text((84, y + 48), URL, font=F(27, True), fill=OKC)

# ── 三步
y += 130
card(56, y, W - 56, y + 300)
d.text((84, y + 22), '装一次，以后就不用管了', font=F(26, True), fill=AC)
steps = [
    '① 手机相机扫码 → 网页打开（第一次会慢几秒）',
    '② 点浏览器右下角菜单 →「安装应用」（苹果是「分享 → 添加到主屏幕」）',
    '③ 桌面就多一个图标。以后点图标就开，跟装了个 App 一样，不用记网址',
]
for i, s in enumerate(steps):
    d.text((84, y + 74 + i * 52), s, font=F(22), fill=TX)
d.text((84, y + 240), '装上以后【不联网也能用】—— 图纸是在手机上算的，不上传任何东西',
       font=F(20), fill=OKC)

# ── 底注
d.text((W // 2, H - 46), '这个版本不用开电脑、不用连 WiFi，随时随地能用',
       font=F(21), fill=WARN, anchor='mm')

im.save(OUT1, 'PNG', optimize=True)
print(f'  ✅ {OUT1}   {os.path.getsize(OUT1):,} B')
try:
    shutil.copy2(OUT1, OUT2)
    print(f'  ✅ 拷到桌面： {OUT2}')
except Exception as e:
    print(f'  ⚠️ 拷桌面失败：{e}')

# 自解验证：二维码扫出来是不是这个网址
try:
    img = cv2.imdecode(np.fromfile(OUT1, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    det = cv2.QRCodeDetector()
    data, _, _ = det.detectAndDecode(img)
    print(f'  自解验证：{"✅ 扫出来就是 " + data if data == URL else "❌ 扫出来是 " + repr(data)}')
except Exception as e:
    print(f'  ⚠️ 自解失败：{e}')
