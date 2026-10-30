"""审计 web/assets/portraits3d 与游戏角色的一一对应关系。

背景：战斗里的玩家立绘走 `assets/portraits3d/<id>.png`（`web/js/battle3d.js` 从
`assets/portraits/<file>.webp` 反推 id）。这个目录曾经混进过「半身大头贴 + 白底 + 水印」
的图（wenxin），肉眼不逐个打开根本发现不了，所以把检查写成脚本。

用法：
  python tools/art/audit_portraits3d.py            # 打印表格
  python tools/art/audit_portraits3d.py --strict   # 有任一问题就返回非 0

战斗里真正发的是 `<id>.webp`（PNG 只作老浏览器兜底），所以探测按 webp → png 的顺序。

判定规则（薄，但能抓住真问题）：
  * 缺图             —— 角色没有对应 png
  * 尺寸不齐         —— 画布高不是 512
  * 底没抠干净       —— 透明像素 < 20%（占位方块约 1%，正常立绘 30–50%）
  * 不是全身         —— 主体高度 < 画布 70%（半身裁切会明显偏矮）
  * 多出来的文件     —— 目录里有、但没有角色用（enemy_* 是兜底图，单独列出）
"""
import os
import re
import sys
import glob
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CHARS_CS = os.path.join(ROOT, 'src', 'AGI2046.Rules', 'GameData.Characters.cs')
DIR_3D = os.path.join(ROOT, 'web', 'assets', 'portraits3d')
DIR_2D = os.path.join(ROOT, 'web', 'assets', 'portraits')

# battle3d.js 里的端口 id 推导规则：assets/portraits/([a-z0-9_]+?)\d*\.(webp|png)
PORTRAIT_RE = re.compile(r'Id = "([a-z0-9_]+)".*?Portrait = "assets/portraits/([a-z0-9_]+?)\d*\.(?:webp|png)"', re.S)
TYPE_RE = re.compile(r'Id = "([a-z0-9_]+)"')

KNOWN_EXTRA = ('enemy_red', 'enemy_yellow', 'enemy_green', 'enemy_blue')  # 阵营色兜底，不对应具体角色


def read_characters():
    src = open(CHARS_CS, encoding='utf-8').read()
    chars = []
    for block in src.split('AddCharacter(new CharacterDef')[1:]:
        block = block.split('AddCharacter(new CharacterDef')[0]
        m_id = TYPE_RE.search(block)
        m_pt = re.search(r'Portrait = "assets/portraits/([a-z0-9_]+?)(\d*)\.(webp|png)"', block)
        if not m_id or not m_pt:
            continue
        chars.append({
            'id': m_id.group(1),
            'file': m_pt.group(1) + m_pt.group(2) + '.' + m_pt.group(3),
            'sprite_id': m_pt.group(1),
        })
    return chars


def probe(path, canvas_h=512):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    a = im.getchannel('A')
    hist = a.histogram()
    alpha0 = hist[0] / (w * h)
    bbox = im.getbbox()
    content_h = (bbox[3] - bbox[1]) / h if bbox else 0
    return {'w': w, 'h': h, 'alpha0': alpha0, 'content_h': content_h, 'canvas_ok': h == canvas_h}


def main():
    strict = '--strict' in sys.argv
    chars = read_characters()
    rows, problems = [], []

    for c in chars:
        webp = os.path.join(DIR_3D, c['sprite_id'] + '.webp')
        png = os.path.join(DIR_3D, c['sprite_id'] + '.png')
        p = webp if os.path.exists(webp) else png
        ref = os.path.join(DIR_2D, c['file'])
        notes = []
        if not os.path.exists(webp):
            notes.append('缺 webp')
        if not os.path.exists(png):
            notes.append('缺 png 兜底')
        if not os.path.exists(p):
            rows.append((c['id'], '缺失', '—', '—', f'缺 {c["sprite_id"]}.webp'))
            problems.append(f'{c["id"]}: 缺 portraits3d/{c["sprite_id"]}.webp')
            continue
        info = probe(p)
        if not info['canvas_ok']:
            notes.append('高≠512')
        if info['alpha0'] < 0.20:
            notes.append('底未抠净')
        if info['content_h'] < 0.70:
            notes.append('疑似非全身')
        if not os.path.exists(ref):
            notes.append('2D 参考缺失')
        rows.append((c['id'], f'{info["w"]}x{info["h"]}', f'{info["alpha0"]:.0%}',
                     f'{info["content_h"]:.0%}', '、'.join(notes) or 'ok'))
        if notes and notes != ['2D 参考缺失']:
            problems.append(f'{c["id"]}: ' + '、'.join(notes))

    used = {c['sprite_id'] + e for c in chars for e in ('.png', '.webp')}
    extra = sorted(os.path.basename(f) for f in glob.glob(os.path.join(DIR_3D, '*.png')) + glob.glob(os.path.join(DIR_3D, '*.webp'))
                   if os.path.basename(f) not in used)

    on_disk = len(glob.glob(os.path.join(DIR_3D, '*.png'))) + len(glob.glob(os.path.join(DIR_3D, '*.webp')))
    print(f'角色 {len(chars)} 名 / portraits3d 文件 {on_disk} 个（每张图 png + webp 两份）\n')
    print(f'{"角色":10s} {"尺寸":10s} {"透明":>5s} {"主体高":>6s}  判定')
    print('-' * 52)
    for r in rows:
        print(f'{r[0]:10s} {r[1]:10s} {r[2]:>5s} {r[3]:>6s}  {r[4]}')

    print('\n多余文件（不对应任何角色）：')
    for f in extra:
        known = os.path.splitext(f)[0] in KNOWN_EXTRA
        print(f'  {f}' + ('   ← 阵营色兜底，保留' if known else '   ← 需要处理'))
        if not known:
            problems.append(f'多余文件 {f}')

    print('\n结论：' + ('全部对应、无异常' if not problems else f'{len(problems)} 个问题'))
    for p in problems:
        print('  - ' + p)
    return 1 if (problems and strict) else 0


if __name__ == '__main__':
    raise SystemExit(main())
