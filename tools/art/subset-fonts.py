"""把站内用到的字符切成一个字体子集，自托管到 web/fonts/。

为什么不用 fonts.googleapis.com：
  * 那份 CSS 本身就 330KB（每个字重 × 上百个 unicode-range 分片）；
  * 内网 / 断网 / 隧道抖动时直接掉字，而这是本地联机游戏，队友可能根本没有外网；
  * 字重、字形都不受我们控制。

做法：
  1. 扫 web/（html/js/css）和 src/（C# 里的技能/道具/剧情文案）收集**会真正渲染**的字符，
     顺手剥掉注释——注释里的字永远不会出现在屏幕上。
  2. 用 Noto Sans SC 变量字体（wght 100–900）切子集，一个文件覆盖所有字重。
  3. Chakra Petch 只取拉丁子集（两个静态字重，各 9KB）。
  4. 输出 woff2 到 web/fonts/，CSS 里的 @font-face 指向它们。

用法：
  python tools/art/subset-fonts.py            # 有就复用 tools/art/raw/NotoSansSC.ttf
  python tools/art/subset-fonts.py --fetch    # 强制重新下载源字体

依赖：pip install fonttools brotli
"""
import glob
import io
import os
import re
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'tools', 'art', 'raw')
OUT = os.path.join(ROOT, 'web', 'fonts')
NOTO_SRC = os.path.join(RAW, 'NotoSansSC.ttf')
NOTO_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf'
CHAKRA_CSS = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&display=swap'
CHROME_UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
             '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
# 除了正文汉字，还要带上标点、全角符号和常见的拉丁/箭头/方块字符
EXTRA = 'U+0020-007E,U+00A0-00FF,U+2000-206F,U+2E80-2EFF,U+3000-303F,U+FF00-FFEF'


def collect_chars():
    chars = set()

    def add(text):
        chars.update(c for c in text if ord(c) > 0x2000)

    for f in glob.glob(os.path.join(ROOT, 'web', '*.html')):
        add(re.sub(r'<!--.*?-->', '', io.open(f, encoding='utf-8', errors='ignore').read(), flags=re.S))
    for f in glob.glob(os.path.join(ROOT, 'web', 'js', '*.js')) + glob.glob(os.path.join(ROOT, 'web', 'css', '*.css')):
        s = io.open(f, encoding='utf-8', errors='ignore').read()
        s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
        s = re.sub(r'(?m)^\s*//.*$', '', s)
        add(s)
    for f in glob.glob(os.path.join(ROOT, 'src', '**', '*.cs'), recursive=True):
        s = io.open(f, encoding='utf-8', errors='ignore').read()
        add(re.sub(r'//.*$', '', s, flags=re.M))
    return chars


def fetch_noto():
    os.makedirs(RAW, exist_ok=True)
    print('下载 Noto Sans SC 变量字体（约 17MB）…')
    req = urllib.request.Request(NOTO_URL, headers={'User-Agent': CHROME_UA})
    with urllib.request.urlopen(req) as r, open(NOTO_SRC, 'wb') as f:
        f.write(r.read())


def subset_noto(text_file):
    from fontTools import subset  # noqa: F401  (确认依赖在)
    cmd = [
        sys.executable, '-m', 'fontTools.subset', NOTO_SRC,
        f'--text-file={text_file}',
        f'--unicodes={EXTRA}',
        '--flavor=woff2',
        f'--output-file={os.path.join(OUT, "noto-sans-sc.woff2")}',
        '--layout-features=kern',
        '--no-hinting',
        '--desubroutinize',
    ]
    os.system(' '.join(f'"{c}"' if ' ' in c else c for c in cmd))


def fetch_chakra():
    print('取 Chakra Petch 拉丁子集…')
    req = urllib.request.Request(CHAKRA_CSS, headers={'User-Agent': CHROME_UA})
    css = urllib.request.urlopen(req).read().decode('utf-8')
    # 只要 unicode-range 覆盖基本拉丁的那两个 @font-face（500 / 700）
    blocks = [b for b in css.split('@font-face') if 'U+0000-00FF' in b]
    from fontTools.ttLib import TTFont
    for i, b in enumerate(blocks):
        url = re.search(r'url\((https://[^)]+)\)', b).group(1)
        tmp = os.path.join(RAW, f'chakra-{i}.woff2')
        urllib.request.urlretrieve(url, tmp)
        weight = TTFont(tmp)['OS/2'].usWeightClass
        os.replace(tmp, os.path.join(OUT, f'chakra-petch-{weight}.woff2'))
        print(f'  chakra {weight} -> {os.path.getsize(os.path.join(OUT, f"chakra-petch-{weight}.woff2")) // 1024}KB')


def main():
    os.makedirs(OUT, exist_ok=True)
    if '--fetch' in sys.argv or not os.path.exists(NOTO_SRC):
        fetch_noto()

    chars = collect_chars()
    text_file = os.path.join(RAW, 'font-charset.txt')
    io.open(text_file, 'w', encoding='utf-8').write(''.join(sorted(chars)))
    cjk = sum(1 for c in chars if 0x4e00 <= ord(c) <= 0x9fff)
    print(f'字符集：{len(chars)} 个（汉字 {cjk}）-> {text_file}')

    subset_noto(text_file)
    size = os.path.getsize(os.path.join(OUT, 'noto-sans-sc.woff2')) // 1024
    print(f'  noto -> {size}KB')

    fetch_chakra()
    print('\n完成。改了文案就重跑一次；字体文件名不变，靠 Cache-Control 一天自然过期。')


if __name__ == '__main__':
    main()
