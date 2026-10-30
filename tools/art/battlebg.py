#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""战场背景落地：裁水印 -> 16:9 -> 暗角 -> WebP。

源图是 1536x1024（3:2），裁掉底部 6% 水印后按 cover 取 16:9。
输出 1600x900，单张控制在 250KB 以内（战场只加载一张）。

用法：
  python tools/art/battlebg.py
"""
import os

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

RAW = os.path.abspath(os.path.join(os.path.dirname(__file__), "raw", "battle"))
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "web", "assets", "battle", "bg"))

JOBS = [
    ("neon-low.png", "neon-low.webp"),
    ("neon-mid.png", "neon-mid.webp"),
    ("neon-auction.png", "neon-auction.webp"),
    ("neon-elite.png", "neon-elite.webp"),
    # 0.19：第二幕（镜海）4 张
    ("mirror-outer.png", "mirror-outer.webp"),
    ("mirror-dome.png", "mirror-dome.webp"),
    ("mirror-hall.png", "mirror-hall.webp"),
    ("mirror-elite.png", "mirror-elite.webp"),
    # 0.19：第三幕（零号轨道）4 张
    ("orbit-hull.png", "orbit-hull.webp"),
    ("orbit-control.png", "orbit-control.webp"),
    ("orbit-core.png", "orbit-core.webp"),
    ("orbit-elite.png", "orbit-elite.webp"),
    # 0.19：两个 Boss 竞技场
    ("boss2-arena.png", "boss2-arena.webp"),
    ("boss3-arena.png", "boss3-arena.webp"),
]


def crop_watermark(im):
    w, h = im.size
    return im.crop((0, 0, w, int(h * 0.94)))


def fit_cover(im, tw, th):
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def vignette(im, strength=0.7):
    """战场背景要比主视觉更暗：棋子/名牌必须在上面读得清。"""
    w, h = im.size
    small = Image.new("L", (max(2, w // 12), max(2, h // 12)), 0)
    px = small.load()
    cx, cy = small.size[0] / 2, small.size[1] / 2
    maxd = (cx ** 2 + cy ** 2) ** 0.5
    for y in range(small.size[1]):
        for x in range(small.size[0]):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / maxd
            px[x, y] = int(max(0.0, min(1.0, (d - 0.35) / 0.65)) ** 2 * 255 * strength)
    mask = small.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(10))
    dark = Image.new("RGB", (w, h), (3, 5, 10))
    return Image.composite(dark, im, mask)


def main():
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for src, name in JOBS:
        path = os.path.join(RAW, src)
        if not os.path.exists(path):
            print(f"  !! 缺源文件 {src}")
            continue
        im = Image.open(path).convert("RGB")
        im = crop_watermark(im)
        im = fit_cover(im, 1600, 900)
        im = vignette(im)
        # 战场背景整体压暗、降饱和，避免和单位抢注意力
        im = ImageEnhance.Brightness(im).enhance(0.95)
        im = ImageEnhance.Color(im).enhance(0.98)
        dest = os.path.join(OUT, name)
        im.save(dest, "WEBP", quality=84, method=6)
        size = os.path.getsize(dest)
        total += size
        print(f"  {name:20s} 1600x900  {size / 1024:.0f} KB")
    print(f"合计 {total / 1024:.0f} KB -> {OUT}")


if __name__ == "__main__":
    main()
