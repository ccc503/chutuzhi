# -*- coding: utf-8 -*-
"""把 pwa/ 传到 GitHub Pages（免费 HTTPS 托管）。

为什么不把 token 写进 remote URL：那样会留在 .git/config 里。
本机 Windows 凭据管理器里已经存了 github 凭据，git 自己能取到，直接 push 就行。

用法： python deploy_pwa.py
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

PWA = r'D:\智库\FDE\cad-app\v4\pwa'
REPO = 'chutuzhi'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
NOWIN = 0x08000000 if os.name == 'nt' else 0


def say(*a):
    print(*a, flush=True)


def sh(args, cwd=None, check=True):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', creationflags=NOWIN)
    if check and r.returncode != 0:
        say('  ❌ ' + ' '.join(args[:3]) + ' …')
        say('     ' + (r.stderr or r.stdout).strip()[:400])
        raise SystemExit(1)
    return (r.stdout or '').strip()


def get_token():
    """从 git 的凭据机制里取 token（不打印）。"""
    r = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                       capture_output=True, text=True, encoding='utf-8', errors='replace',
                       creationflags=NOWIN)
    m = re.search(r'^password=(.*)$', r.stdout or '', re.M)
    u = re.search(r'^username=(.*)$', r.stdout or '', re.M)
    return (u.group(1).strip() if u else ''), (m.group(1).strip() if m else '')


def api(method, path, token, body=None):
    url = 'https://api.github.com' + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': f'Bearer {token}',
        'User-Agent': UA,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode('utf-8', 'replace')
            return r.status, (json.loads(txt) if txt.strip() else {})
    except urllib.error.HTTPError as e:
        txt = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, {'raw': txt[:300]}


def main():
    user, token = get_token()
    if not token:
        say('❌ 取不到 github token')
        return 1
    say(f'账号 {user}   令牌 {len(token)} 字符（不打印内容）')

    # ── ① 建仓库（已存在就跳过）
    say('\n① 建仓库')
    st, r = api('GET', f'/repos/{user}/{REPO}', token)
    if st == 200:
        say(f'  已存在：{r["full_name"]}')
    else:
        st2, r2 = api('POST', '/user/repos', token, {
            'name': REPO,
            'description': '出图纸 —— 电气原理图助手（离线 PWA，装在手机桌面上用）',
            'private': False,
            'has_issues': False,
            'has_wiki': False,
            'has_projects': False,
            'auto_init': False,
        })
        if st2 not in (200, 201):
            say(f'  ❌ 建仓库失败 HTTP {st2}: {json.dumps(r2, ensure_ascii=False)[:300]}')
            return 1
        say(f'  ✅ 建好了：{r2["full_name"]}')

    # ── ② git 提交 + push
    say('\n② 提交 + 推上去')
    open(os.path.join(PWA, '.nojekyll'), 'w').close()          # 别让 Pages 跑 Jekyll
    readme = os.path.join(PWA, 'README.md')
    if not os.path.exists(readme):
        with open(readme, 'w', encoding='utf-8', newline='') as f:
            f.write('# 出图纸 · 电气原理图助手（手机版）\n\n'
                    '说一句话或点几下，出一张 A3 电气原理图。**全部在手机上算**，'
                    '不联网、不上传、不依赖电脑。\n\n'
                    '## 怎么装到手机\n\n'
                    '1. 手机 Chrome 打开本仓库的 Pages 网址\n'
                    '2. 右上角菜单 →「安装应用」/「添加到主屏幕」\n'
                    '3. 桌面就多一个图标，点开没有地址栏，断网也能用\n\n'
                    '## 改了内容怎么更新\n\n'
                    '`python build_pwa.py && python deploy_pwa.py`\n')

    if not os.path.isdir(os.path.join(PWA, '.git')):
        sh(['git', 'init', '-b', 'main'], PWA)
        sh(['git', 'remote', 'add', 'origin', f'https://github.com/{user}/{REPO}.git'], PWA)
    sh(['git', 'add', '-A'], PWA)
    diff = subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=PWA, creationflags=NOWIN)
    if diff.returncode != 0:
        sh(['git', 'commit', '-m', 'PWA: 出图纸 · 电气原理图助手（离线手机版）'], PWA)
        say('  已提交')
    else:
        say('  （内容没变，不用提交）')
    sh(['git', 'push', '-u', 'origin', 'main'], PWA)
    say('  ✅ 推上去了')

    # ── ③ 开 GitHub Pages
    say('\n③ 打开 Pages')
    st, r = api('GET', f'/repos/{user}/{REPO}/pages', token)
    if st == 200:
        say(f'  已经开着：{r.get("html_url")}')
    else:
        st2, r2 = api('POST', f'/repos/{user}/{REPO}/pages', token,
                      {'source': {'branch': 'main', 'path': '/'}})
        if st2 in (200, 201):
            say(f'  ✅ 开好了：{r2.get("html_url")}')
        else:
            say(f'  ⚠️ HTTP {st2}: {json.dumps(r2, ensure_ascii=False)[:300]}')
            say('     （如果报权限，就去仓库 Settings → Pages 手动选 main / 根目录）')

    url = f'https://{user}.github.io/{REPO}/'
    say('\n' + '=' * 54)
    say(f'📱 手机上的网址： {url}')
    say('   （第一次部署要等 1~3 分钟才能打开）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
