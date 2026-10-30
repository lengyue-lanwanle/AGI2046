#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""主视觉落地：裁水印 -> 压暗边角 -> 输出 WebP。

生成器固定在右下角打「AI生成」水印，所以统一裁掉底部 6%。
宽图（标题/幕间）裁到 16:9 附近，竖图（Boss）裁到 3:4，避免页面里再被 object-fit 二次裁切。

用法：
  python tools/art/keyart.py
"""
import os

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

RAW = os.path.abspath(os.path.join(os.path.dirname(__file__), "raw"))
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "web", "assets", "keyart"))

# (源文件, 输出名, 目标宽, 目标高, 质量)
JOBS = [
    ("key-title.png", "title.webp", 1600, 900, 84),
    ("key-act1.png", "act1.webp", 1280, 720, 82),
    ("key-act2.png", "act2.webp", 1280, 720, 82),
    ("key-act3.png", "act3.webp", 1280, 720, 82),
    ("key-boss1.png", "boss1.webp", 760, 1013, 84),
    ("key-boss2.png", "boss2.webp", 760, 1013, 84),
    ("key-boss3.png", "boss3.webp", 760, 1013, 84),
]


def crop_watermark(im):
    """底部 6% 是生成器水印，直接裁掉；宽图损失高度后再按目标比例裁。"""
    w, h = im.size
    return im.crop((0, 0, w, int(h * 0.94)))


def scrub_text(im):
    """擦掉生成器自己加在左上角的「NEON HARBOR 2046」。

    prompt 里写了 no text，图还是被加了标题字。那块区域是纯暗部，
    所以只对文字所在的矩形做中值滤波 + 羽化贴回：
    中值滤波会把细笔画的字吃掉，同时保留雨丝和顶部的辉光条纹。
    """
    w, h = im.size
    x0, y0 = int(w * 0.30), int(h * 0.11)
    rect = (0, 0, x0, y0)
    patch = im.crop(rect)
    # 连续两次中值：一次去字，一次抹掉第一次留下的斑
    patch = patch.filter(ImageFilter.MedianFilter(9)).filter(ImageFilter.MedianFilter(9))
    patch = patch.filter(ImageFilter.GaussianBlur(1.2))
    # 羽化遮罩：边缘 18px 渐变，避免贴回时出现矩形接缝
    mask = Image.new("L", patch.size, 255)
    d = ImageDraw.Draw(mask)
    feather = 18
    for i in range(feather):
        v = int(255 * i / feather)
        d.rectangle([i, i, patch.size[0] - 1 - i, patch.size[1] - 1 - i], outline=v)
    im.paste(patch, rect, mask)
    return im


def fit_cover(im, tw, th):
    """按 cover 方式裁切到目标比例，不做拉伸。"""
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def vignette(im, strength=0.45):
    """四角压暗：把视线收到画面中心，也顺手掩盖生成图的边角瑕疵。"""
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    # 用径向渐变做遮罩：中心 0（不压暗），边缘 255（压暗）
    small = Image.new("L", (max(2, w // 8), max(2, h // 8)), 0)
    px = small.load()
    cx, cy = small.size[0] / 2, small.size[1] / 2
    maxd = (cx ** 2 + cy ** 2) ** 0.5
    for y in range(small.size[1]):
        for x in range(small.size[0]):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / maxd
            px[x, y] = int(max(0.0, min(1.0, (d - 0.45) / 0.55)) ** 2 * 255 * strength)
    mask = small.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(8))
    dark = Image.new("RGB", (w, h), (3, 5, 10))
    return Image.composite(dark, im, mask)


def main():
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for src, name, tw, th, q in JOBS:
        path = os.path.join(RAW, src)
        if not os.path.exists(path):
            print(f"  !! 缺源文件 {src}")
            continue
        im = Image.open(path).convert("RGB")
        im = crop_watermark(im)
        if src == "key-title.png":
            im = scrub_text(im)
        im = fit_cover(im, tw, th)
        im = vignette(im, 0.5 if tw > th else 0.6)
        im = ImageEnhance.Color(im).enhance(1.04)
        dest = os.path.join(OUT, name)
        im.save(dest, "WEBP", quality=q, method=6)
        size = os.path.getsize(dest)
        total += size
        print(f"  {name:12s} {tw}x{th}  {size / 1024:.0f} KB")
    print(f"合计 {total / 1024:.0f} KB -> {OUT}")


if __name__ == "__main__":
    main()
