# -*- coding: utf-8 -*-
"""把离线单文件（cad-app/v4/出图纸.html）打成可以「装到手机桌面」的 PWA。

做的事：
  ① 复制成 pwa/index.html
  ② 往 <head> 里插 manifest + apple-touch-icon
  ③ 往 </body> 前插 Service Worker 注册脚本
  ④ 给 sw.js 打版本号（用源文件的修改时间，内容一变版本就变 → 手机才会拿新的）
  ⑤ 自检：文件里不能有任何外部 http(s) 资源，否则断网就打不开

用法： python build_pwa.py
"""
import hashlib
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

V4 = r'D:\智库\FDE\cad-app\v4'
SRC = os.path.join(V4, '出图纸.html')
PWA = os.path.join(V4, 'pwa')
DST = os.path.join(PWA, 'index.html')
SW = os.path.join(PWA, 'sw.js')

HEAD_ADD = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-192.png">
'''

SW_REG = '''<script>
/* 注册 Service Worker —— 让 Android Chrome 认识这是"能装的 App"，
   顺便把整页缓存下来（装上以后断网也能用）。失败也无所谓，页面照常能用。 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  });
}
</script>
'''


def main():
    html = open(SRC, encoding='utf-8').read()
    print(f'源文件 {SRC}  {len(html):,} 字符')

    # ① 已经插过就不重复插
    if 'rel="manifest"' in html:
        print('  （已经插过 manifest，跳过插入）')
        out = html
    else:
        # ② manifest 插在 theme-color 那行后面，这样 apple-touch-icon 也跟着
        anchor = '<meta name="theme-color" content="#16171a">'
        if anchor not in html:
            anchor = '<title>'
        out = html.replace(anchor, anchor + '\n' + HEAD_ADD, 1)

        # ③ SW 注册插在 </body> 前
        # ⚠️ 必须用【最后一处】 </body> —— 这个文件里第一处 </body> 在 JS 模板字符串里
        #    （导出打印页用的 `<!DOCTYPE html>…</body></html>`），
        #    往那里插 <script> 会把模板字符串撑断 → 整块脚本 "Unexpected end of input"
        i = out.rfind('</body>')
        if i >= 0:
            out = out[:i] + SW_REG + out[i:]
        else:
            out = out + SW_REG

    # ④ 自检：不能有外部资源
    ext = re.findall(r'(?:src|href)\s*=\s*["\']https?://[^"\']+', out)
    ext = [x for x in ext if 'w3.org' not in x]
    if ext:
        print('  ❌ 发现外部资源，断网会打不开：')
        for x in ext[:10]:
            print('     ' + x)
        return 1
    print('  ✅ 没有任何外部资源（断网也能用）')

    os.makedirs(PWA, exist_ok=True)
    with open(DST, 'w', encoding='utf-8', newline='') as f:
        f.write(out)
    print(f'  ✅ 写出 {DST}  {len(out):,} 字符')

    # ⑤ 自检：把每个 <script> 块抽出来 node --check
    #    为什么必须做：单文件 HTML 里一个字符的语法错会让【整块脚本不执行】，
    #    而页面照常渲染 → 看着一切正常、按钮全死（AGENTS.md 记过的坑）。
    import shutil
    import subprocess
    import tempfile
    node = shutil.which('node')
    if node:
        blocks = re.findall(r'<script[^>]*>(.*?)</script>', out, re.S)
        bad = 0
        for idx, blk in enumerate(blocks, 1):
            tf = os.path.join(tempfile.gettempdir(), f'_chk_pwa_{idx}.js')
            with open(tf, 'w', encoding='utf-8', newline='') as f:
                f.write(blk)
            r = subprocess.run([node, '--check', tf], capture_output=True, text=True,
                               encoding='utf-8', errors='replace', creationflags=0x08000000)
            if r.returncode != 0:
                bad += 1
                print(f'  ❌ <script> 第 {idx} 块语法错：' + r.stderr.strip().splitlines()[0][:200])
        if bad:
            return 1
        print(f'  ✅ {len(blocks)} 个 <script> 块语法全过（node --check）')
    else:
        print('  ⚠️ 没找到 node，跳过语法自检')

    # ⑤ sw.js 打版本号
    ver = hashlib.sha256(out.encode('utf-8')).hexdigest()[:12]
    sw = open(SW, encoding='utf-8').read()
    # ⚠️ 只换 `const VER = PREFIX + '…'` 那一处 —— 以前用 chutuzhi-[0-9a-f_]+ 全量替换，
    #    会连注释/前缀常量一起改，加了 PREFIX 之后必须收紧
    sw2 = re.sub(r"(const VER = PREFIX \+ ')[^']*(')", rf"\g<1>{ver}\g<2>", sw)
    if sw2 == sw:
        print('  ❌ sw.js 版本号没换成（源码里找不到 `const VER = PREFIX + \'…\'`）')
        return 1
    with open(SW, 'w', encoding='utf-8', newline='') as f:
        f.write(sw2)
    print(f'  ✅ sw.js 版本 = chutuzhi-site-{ver}')

    # ⑥ 交付清单
    print('\n  pwa 目录：')
    for n in sorted(os.listdir(PWA)):
        p = os.path.join(PWA, n)
        print(f'    {n:28} {os.path.getsize(p):>9,} B')
    return 0


if __name__ == '__main__':
    sys.exit(main())
