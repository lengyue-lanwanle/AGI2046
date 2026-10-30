"""把「纯色背景」的生成图抠成带 Alpha 的立绘，并统一尺寸。

用法：
  python tools/art/keyout.py <输入目录> <输出目录> [高度]

处理步骤：
  1. 裁掉底部 5%（生成器会在右下角打「AI生成」水印）
  2. 从四边用 flood fill 找到与主体连通的背景（不是全图按颜色替换，
     所以角色身上的同色区域不会被吃掉）
  3. 边缘去溢色：只对「紧贴透明区」的 2px 带做通道钳制，避免粉色装甲被洗白
  4. 自动裁到主体外框，统一按高度缩放，留 4% 边距
"""
import os
import sys
import glob
import statistics
from PIL import Image, ImageChops, ImageDraw, ImageFilter

CROP_BOTTOM = 0.05      # 裁掉底部比例（去水印）
FEATHER = 0.7           # alpha 羽化半径
SPILL = 42              # 去溢色强度


def detect_key(im):
    """取四角与四边中点的中位色作为背景色。"""
    w, h = im.size
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3),
           (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]
    px = im.load()
    samples = [px[x, y] for x, y in pts]
    return tuple(int(statistics.median(s[i] for s in samples)) for i in range(3))


def key_out(path, out_path, target_h=640):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    im = im.crop((0, 0, w, int(h * (1 - CROP_BOTTOM))))
    w, h = im.size

    key = detect_key(im)
    # 背景色过于灰/白时说明没按指令来，跳过（免得把主体整块吃掉）
    mx, mn = max(key), min(key)
    if mx - mn < 60:
        print(f'  [跳过] {os.path.basename(path)} 背景不是纯色: {key}')
        return None

    work = im.copy()
    sentinel = (1, 2, 3)
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for s in seeds:
        ImageDraw.floodfill(work, s, sentinel, thresh=64)

    # 与哨兵色完全相等的像素 = 背景
    diff = ImageChops.difference(work, Image.new('RGB', im.size, sentinel))
    alpha = diff.convert('L').point(lambda v: 0 if v == 0 else 255)

    # 去溢色：只在透明边缘的窄带里钳制被背景污染最多的通道
    band = alpha.point(lambda v: 255 if v == 0 else 0)
    band = band.filter(ImageFilter.MaxFilter(5))
    r, g, b = im.split()
    if key[0] > 120 and key[2] > 120 and key[1] < 120:      # 品红底：压 r/b
        cap = ImageChops.add(g, Image.new('L', im.size, SPILL))
        fixed = Image.merge('RGB', (ImageChops.darker(r, cap), g, ImageChops.darker(b, cap)))
    else:                                                    # 绿底：压 g
        cap = ImageChops.add(ImageChops.lighter(r, b), Image.new('L', im.size, SPILL))
        fixed = Image.merge('RGB', (r, ImageChops.darker(g, cap), b))
    im = Image.composite(fixed, im, band)

    # 羽化 + 轻微收紧，压掉锯齿
    alpha = alpha.filter(ImageFilter.GaussianBlur(FEATHER))
    alpha = alpha.point(lambda v: 0 if v < 36 else (255 if v > 210 else v))
    rgba = im.convert('RGBA')
    rgba.putalpha(alpha)

    bbox = rgba.getbbox()
    if not bbox:
        print(f'  [跳过] {os.path.basename(path)} 抠完是空的')
        return None
    rgba = rgba.crop(bbox)

    # 统一高度，留边距后放到透明画布
    sw, sh = rgba.size
    scale = (target_h * 0.92) / sh
    nw, nh = max(1, int(sw * scale)), int(sh * scale)
    rgba = rgba.resize((nw, nh), Image.LANCZOS)
    canvas_w = int(target_h * 0.82)
    canvas = Image.new('RGBA', (canvas_w, target_h), (0, 0, 0, 0))
    canvas.paste(rgba, ((canvas_w - nw) // 2, target_h - nh - int(target_h * 0.02)), rgba)

    canvas.save(out_path)
    return canvas.size


def main():
    src = sys.argv[1]
    dst = sys.argv[2]
    target_h = int(sys.argv[3]) if len(sys.argv) > 3 else 640
    os.makedirs(dst, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src, '*.png')))
    ok = 0
    for f in files:
        out = os.path.join(dst, os.path.basename(f))
        size = key_out(f, out, target_h)
        if size:
            ok += 1
            print(f'  ok {os.path.basename(f)} -> {size[0]}x{size[1]}')
    print(f'\n完成 {ok}/{len(files)}，输出 {dst}')


if __name__ == '__main__':
    main()
