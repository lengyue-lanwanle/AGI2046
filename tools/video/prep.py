#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把生成器吐的 MP4 压成网页能直接用的 720p，并导出首帧当 poster。

为什么需要这一步：视频模型给的是 1080p、三五 MB、moov 在文件末尾的片子。
直接丢进网页有三个问题——手机加载慢、边下边播要等整个文件、首帧还没解码时是黑屏。

用法：
  python tools/video/prep.py <input.mp4> <name> [--crf 28] [--max 5]
  python tools/video/prep.py --demo            # 用 title.webp 造一段 5s 推镜当测试夹具

产物：
  web/assets/cg/<name>.mp4   H.264 High / yuv420p / faststart / 无音轨
  web/assets/cg/<name>.webp  0.6s 处首帧，用作 <video poster>

之后在 web/js/cg.js 的 CLIPS 里登记一行就能播。
"""
import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'web', 'assets', 'cg')
FIXTURE_DIR = os.path.join(ROOT, 'tools', 'video', 'fixture')


def find_ffmpeg():
    """按可靠性顺序找 ffmpeg：环境变量 → imageio-ffmpeg → 常见安装位置。"""
    env = os.environ.get('FFMPEG')
    if env and os.path.exists(env):
        return env
    try:
        import imageio_ffmpeg
        p = imageio_ffmpeg.get_ffmpeg_exe()
        if p and os.path.exists(p):
            return p
    except Exception:
        pass
    # 退路：其它软件自带的 ffmpeg（bilibili / 剪映等）。版本旧但 H.264 够用。
    for p in (
        os.path.expandvars(r'%APPDATA%\bilibili\ffmpeg\ffmpeg.exe'),
        r'C:\ffmpeg\bin\ffmpeg.exe',
        r'C:\Program Files\ffmpeg\bin\ffmpeg.exe',
    ):
        if os.path.exists(p):
            return p
    return shutil.which('ffmpeg')


def run(ff, args):
    r = subprocess.run([ff, '-hide_banner', '-loglevel', 'error'] + args,
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr or 'ffmpeg 失败\n')
        sys.exit(r.returncode)


def kb(path):
    return max(1, round(os.path.getsize(path) / 1024))


def encode(ff, src, name, crf, max_len, crop=None):
    os.makedirs(OUT_DIR, exist_ok=True)
    mp4 = os.path.join(OUT_DIR, name + '.mp4')
    webp = os.path.join(OUT_DIR, name + '.webp')

    # crop 先做：部分模型会在左上角打「AI生成」，必须裁掉再缩放，
    # 否则水印会跟着一起被缩进画面里。
    vf = ''
    if crop:
        t, r, b, l = crop
        vf += f'crop=iw-{l + r}:ih-{t + b}:{l}:{t},'
    # -vf scale=-2:720：宽度自动取偶数，避免 H.264 要求偶数尺寸
    # -movflags +faststart：moov 前置，浏览器不用下完就能起播
    # -an：不带头声，声音仍由游戏自己的 WebAudio 负责
    run(ff, ['-i', src, '-t', str(max_len),
             '-vf', vf + 'scale=-2:720:flags=lanczos',
             '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow',
             '-crf', str(crf), '-pix_fmt', 'yuv420p',
             '-movflags', '+faststart', '-an', '-y', mp4])

    # poster 取 0.6s：避开部分片子开头的黑场或淡入
    run(ff, ['-ss', '0.6', '-i', mp4, '-frames:v', '1',
             '-c:v', 'libwebp', '-quality', '84', '-y', webp])

    before = kb(src) if src != mp4 else kb(mp4)
    print(f'  {os.path.basename(src)} {before} KB  ->  {name}.mp4 {kb(mp4)} KB + {name}.webp {kb(webp)} KB')
    return mp4, webp


def make_demo(ff):
    """测试夹具：主视觉 + 5 秒推镜。用来验证播放器，不当作正式开场。"""
    os.makedirs(FIXTURE_DIR, exist_ok=True)
    art = os.path.join(ROOT, 'web', 'assets', 'keyart', 'title.webp')
    raw = os.path.join(FIXTURE_DIR, 'demo-raw.mp4')
    run(ff, ['-loop', '1', '-i', art,
             '-vf', "scale=2400:-1,zoompan=z='min(1.0+0.0009*on,1.18)'"
                    ":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=120:s=1920x1080:fps=24,format=yuv420p",
             '-t', '5', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-y', raw])
    mp4 = os.path.join(FIXTURE_DIR, 'demo-720p.mp4')
    webp = os.path.join(FIXTURE_DIR, 'demo-poster.webp')
    run(ff, ['-i', raw, '-vf', 'scale=-2:720:flags=lanczos',
             '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow',
             '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-y', mp4])
    run(ff, ['-ss', '0.6', '-i', mp4, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '84', '-y', webp])
    os.remove(raw)
    print(f'  夹具：{os.path.basename(mp4)} {kb(mp4)} KB + {os.path.basename(webp)} {kb(webp)} KB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', nargs='?')
    ap.add_argument('name', nargs='?')
    ap.add_argument('--crf', type=int, default=28, help='越大越小越糊；28 适合带雨的夜景')
    ap.add_argument('--max', type=int, default=5, help='最长秒数；超过就裁掉')
    ap.add_argument('--crop', default='', metavar='T,R,B,L',
                    help='先裁掉边缘像素（去生成器水印），例：--crop 48,0,0,0')
    ap.add_argument('--demo', action='store_true', help='生成测试夹具')
    a = ap.parse_args()

    ff = find_ffmpeg()
    if not ff:
        print('找不到 ffmpeg。装一个：pip install imageio-ffmpeg，或设置 FFMPEG 环境变量。')
        return 1
    print('ffmpeg:', ff)

    if a.demo:
        make_demo(ff)
        return 0
    if not a.src or not a.name:
        ap.print_help()
        return 1
    crop = None
    if a.crop:
        parts = [int(x) for x in a.crop.split(',')]
        if len(parts) != 4:
            print('--crop 需要 4 个数：上,右,下,左')
            return 1
        crop = parts
    encode(ff, os.path.abspath(a.src), a.name, a.crf, a.max, crop)
    return 0


if __name__ == '__main__':
    sys.exit(main())
