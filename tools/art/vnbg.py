"""VN 背景：裁水印 → 1600×900 → 压暗底部（对话框安全区）→ 暗角 → WebP。

为什么底部要单独压暗：对话框是半透明的，背景太亮会透上来把字吃掉。
样式层也有一层渐变，但那是 0.72 的黑，遇见浅色场景（比如清晨结局）不够用。
"""
import glob
import os

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

RAW = 'tools/art/raw/vn'
OUT = 'web/assets/vn/bg'
TARGET = (1600, 900)

FILES = {
    'VNBG_RAIN': 'rain.webp',
    'VNBG_AUCTION': 'auction.webp',
    'VNBG_MIRROR': 'mirror.webp',
    'VNBG_LIFT': 'lift.webp',
    'VNBG_CORE': 'core.webp',
    'VNBG_DAWN': 'dawn.webp',
}


def crop_watermark(im):
    w, h = im.size
    return im.crop((0, 0, w, int(h * 0.94)))


def fit_cover(im, tw, th):
    w, h = im.size
    scale = max(tw / w, th / h)
    nw, nh = int(w * scale + 0.5), int(h * scale + 0.5)
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 3          # 略偏上，保住天空/天花板
    return im.crop((left, top, left + tw, top + th))


def grade(im, key):
    # 慢一点的对比、别过饱和：VN 是背景，不是主视觉
    im = ImageEnhance.Brightness(im).enhance(0.94)
    im = ImageEnhance.Color(im).enhance(0.96)
    im = ImageEnhance.Contrast(im).enhance(1.03)

    w, h = im.size
    # 底部安全区：从 58% 开始渐黑到 78%
    veil = Image.new('L', (1, h), 0)
    px = veil.load()
    start, end = int(h * 0.58), int(h * 0.80)
    for y in range(h):
        if y < start:
            v = 0
        elif y < end:
            v = int(150 * (y - start) / max(1, end - start))
        else:
            v = 150
        px[0, y] = v
    veil = veil.resize((w, h))
    dark = Image.new('RGB', im.size, (3, 5, 10))
    im = Image.composite(dark, im, veil.point(lambda v: int(v * 0.86)))

    # 暗角
    vig = Image.new('L', im.size, 0)
    d = ImageDraw.Draw(vig)
    d.ellipse((-int(w * 0.22), -int(h * 0.30), int(w * 1.22), int(h * 1.30)), fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(160))
    edge = Image.new('RGB', im.size, (2, 4, 8))
    im = Image.composite(im, edge, vig)
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for path in sorted(glob.glob(os.path.join(RAW, '*.png'))):
        name = os.path.basename(path)
        key = next((k for k in FILES if name.startswith(k)), None)
        if not key:
            continue
        out = os.path.join(OUT, FILES[key])
        im = Image.open(path).convert('RGB')
        im = crop_watermark(im)
        im = fit_cover(im, *TARGET)
        im = grade(im, key)
        im.save(out, 'WEBP', quality=84, method=6)
        size = os.path.getsize(out)
        total += size
        print(f'{key:14s} -> {FILES[key]:14s} {size/1024:6.0f} KB')
    print(f'total {total/1024/1024:.2f} MB')


if __name__ == '__main__':
    main()
