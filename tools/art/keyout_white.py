"""把白底角色立绘抠成透明（只吃「与画布边缘连通」的近白像素，不会伤到白裙子）。

用法：
  python tools/art/keyout_white.py web/assets/portraits [--dry]

每个文件会打印背景色、去掉的比例与最终尺寸；--dry 只报告不改文件。
"""
import os
import sys
import glob
from PIL import Image, ImageChops, ImageDraw, ImageFilter

TOL = 18          # 白底容差：太大会漏进浅色衣服
FEATHER = 0.6


def process(path, dry=False):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    bg = im.getpixel((2, 2))
    # 只在接近白色时处理，别的底色跳过
    if min(bg) < 225:
        print(f'  skip {os.path.basename(path)} 背景不是白色: {bg}')
        return False

    work = im.copy()
    sentinel = (1, 2, 3)
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for s in seeds:
        ImageDraw.floodfill(work, s, sentinel, thresh=TOL)

    diff = ImageChops.difference(work, Image.new('RGB', im.size, sentinel))
    alpha = diff.convert('L').point(lambda v: 0 if v == 0 else 255)
    alpha = alpha.filter(ImageFilter.GaussianBlur(FEATHER))
    alpha = alpha.point(lambda v: 0 if v < 40 else (255 if v > 216 else v))

    rgba = im.convert('RGBA')
    rgba.putalpha(alpha)
    bbox = rgba.getbbox()
    if not bbox:
        print(f'  skip {os.path.basename(path)} 抠完为空')
        return False
    rgba = rgba.crop(bbox)

    removed = 1 - sum(alpha.histogram()[41:]) / (w * h)
    print(f'  ok {os.path.basename(path)} 底色{tuple(bg)} 去除{removed:.0%} → {rgba.size[0]}x{rgba.size[1]}')
    if not dry:
        out = os.path.splitext(path)[0] + '.webp'
        rgba.save(out, 'WEBP', quality=90, method=6)
    return True


def main():
    folder = sys.argv[1]
    dry = '--dry' in sys.argv
    files = sorted(glob.glob(os.path.join(folder, '*.webp')))
    ok = sum(process(f, dry) for f in files)
    print(f'\n完成 {ok}/{len(files)}')


if __name__ == '__main__':
    main()
