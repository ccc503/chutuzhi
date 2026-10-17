# -*- coding: utf-8 -*-
"""用 GitHub 的 Contents API 上传文件 —— 绕开 github.com 被墙（api.github.com 是通的）。

为什么不用 git push：`git push` 走 github.com:443，本机实测
  `fatal: unable to access 'https://github.com/...': Recv failure: Connection was reset`
而 api.github.com 一直通（AGENTS.md 也记着这条）。

用法： python upload_api.py
"""
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

PWA = r'D:\智库\FDE\cad-app\v4\pwa'
REPO = 'chutuzhi'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
NOWIN = 0x08000000 if os.name == 'nt' else 0

SKIP_DIRS = {'.git', '__pycache__'}
SKIP_EXT = {'.pyc', '.log'}


def say(*a):
    print(*a, flush=True)


def get_token():
    r = subprocess.run(['git', 'credential', 'fill'],
                       input='protocol=https\nhost=github.com\n\n',
                       capture_output=True, text=True, encoding='utf-8', errors='replace',
                       creationflags=NOWIN)
    m = re.search(r'^password=(.*)$', r.stdout or '', re.M)
    return m.group(1).strip() if m else ''


def api(method, path, token, body=None):
    req = urllib.request.Request(
        'https://api.github.com' + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={'Authorization': f'Bearer {token}', 'User-Agent': UA,
                 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode('utf-8', 'replace')
            return r.status, (json.loads(txt) if txt.strip() else {})
    except urllib.error.HTTPError as e:
        txt = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, {'raw': txt[:300]}


def main():
    token = get_token()
    if not token:
        say('❌ 没有 token')
        return 1
    st, me = api('GET', '/user', token)
    if st != 200:
        say(f'❌ token 不能用 HTTP {st}')
        return 1
    user = me['login']
    say(f'账号 {user}   仓库 {user}/{REPO}')

    # 收集要传的文件
    files = []
    for root, dirs, names in os.walk(PWA):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            if os.path.splitext(n)[1] in SKIP_EXT:
                continue
            p = os.path.join(root, n)
            rel = os.path.relpath(p, PWA).replace('\\', '/')
            files.append((rel, p))
    files.sort(key=lambda x: (x[0].count('/'), x[0]))
    say(f'要传 {len(files)} 个文件\n')

    ok = fail = 0
    for rel, p in files:
        data = open(p, 'rb').read()
        # 已存在的话要先拿 sha 才能覆盖
        st, cur = api('GET', f'/repos/{user}/{REPO}/contents/{rel}', token)
        body = {'message': f'上传 {rel}', 'content': base64.b64encode(data).decode()}
        if st == 200 and isinstance(cur, dict) and cur.get('sha'):
            body['sha'] = cur['sha']
            # 内容没变就跳过（GitHub 会报 422 "sha didn't match" 之外还会白传一次）
            try:
                old = base64.b64decode(cur.get('content', '') or '')
                if old == data:
                    say(f'  ⏭  {rel:32} （没变）')
                    continue
            except Exception:
                pass
        st2, r2 = api('PUT', f'/repos/{user}/{REPO}/contents/{rel}', token, body)
        if st2 in (200, 201):
            ok += 1
            say(f'  ✅ {rel:32} {len(data):>9,} B')
        else:
            fail += 1
            msg = json.dumps(r2, ensure_ascii=False)[:160]
            say(f'  ❌ {rel:32} HTTP {st2}  {msg}')
        time.sleep(0.4)          # 别把 API 打限流

    say(f'\n上传完成：成功 {ok} ｜ 失败 {fail}')

    # 确认默认分支
    st, rp = api('GET', f'/repos/{user}/{REPO}', token)
    if st == 200:
        say(f'默认分支 = {rp.get("default_branch")}')

    # 开 Pages
    say('\n打开 GitHub Pages')
    st, r = api('GET', f'/repos/{user}/{REPO}/pages', token)
    if st == 200:
        say(f'  已经开着：{r.get("html_url")}')
    else:
        st2, r2 = api('POST', f'/repos/{user}/{REPO}/pages', token,
                      {'source': {'branch': 'main', 'path': '/'}})
        if st2 in (200, 201):
            say(f'  ✅ 开好了：{r2.get("html_url")}')
        else:
            say(f'  ⚠️ HTTP {st2}  {json.dumps(r2, ensure_ascii=False)[:250]}')
            say('     手动去：仓库 → Settings → Pages → Source 选 main / (root) → Save')

    say('\n' + '=' * 54)
    say(f'📱 网址：https://{user}.github.io/{REPO}/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
