"""绿幕全局抠图：比 keyout.py 的 flood fill 更狠，能吃掉被主体包围的背景空洞。

为什么需要它：`keyout.py` 从四边 flood fill，只能去掉「与画布边缘连通」的背景。
一旦背景被发丝/车轮围成一个封闭区域（本项目 wenxin 就踩了这个坑），
那块绿色会原样留在立绘上，在深色棋盘里非常刺眼。

用法：
  python tools/art/keyout_green.py <输入.png> <输出.png> [目标高] [--trim-watermark]

处理步骤：
  1. 按「绿色通道比 R/B 高出多少」算软 alpha（不依赖连通性）
  2. 去溢色：把 G 钳到 max(R,B)+8，消掉描边外侧的绿边
  3. 羽化 + 收紧，压掉锯齿
  4. 裁到主体外框，统一高度，底部对齐放进透明画布（宽 = 主体宽，与 portraits3d 现有 16 张一致）
"""
import sys
from PIL import Image, ImageChops, ImageFilter

KEY_LO = 18      # g - max(r,b) 低于此值 = 前景
KEY_HI = 72      # 高于此值 = 纯背景
DESPILL = 8
FEATHER = 0.6


def key_green(path, out_path, target_h=512, trim_watermark=False):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    r, g, b = im.split()
    mb = ImageChops.lighter(r, b)
    diff = ImageChops.subtract(g, mb, 1, 0)
    key = diff.point(lambda v: 0 if v <= KEY_LO else (255 if v >= KEY_HI else int((v - KEY_LO) * 255 / (KEY_HI - KEY_LO))))
    alpha = key.point(lambda v: 255 - v)

    # 去溢色：G 不超过 max(R,B)+DESPILL
    cap = ImageChops.add(mb, Image.new('L', im.size, DESPILL))
    im = Image.merge('RGB', (r, ImageChops.darker(g, cap), b))

    alpha = alpha.filter(ImageFilter.GaussianBlur(FEATHER))
    alpha = alpha.point(lambda v: 0 if v < 40 else (255 if v > 200 else v))

    if trim_watermark:
        from PIL import ImageDraw
        m = Image.new('L', im.size, 255)
        d = ImageDraw.Draw(m)
        d.rectangle([int(w * 0.70), int(h * 0.955), w, h], fill=0)
        alpha = ImageChops.multiply(alpha, m)

    rgba = im.convert('RGBA')
    rgba.putalpha(alpha)
    bbox = rgba.getbbox()
    if not bbox:
        raise SystemExit('抠完是空的')
    rgba = rgba.crop(bbox)

    sw, sh = rgba.size
    scale = (target_h * 0.96) / sh
    nw, nh = max(1, round(sw * scale)), round(sh * scale)
    if nw > target_h * 0.95:            # 太宽就按宽收敛，避免进游戏被拉伸变形
        nw = round(target_h * 0.95)
        nh = round(sh * nw / sw)
    rgba = rgba.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (nw, target_h), (0, 0, 0, 0))
    canvas.paste(rgba, (0, target_h - nh - round(target_h * 0.02)), rgba)
    canvas.save(out_path)
    return canvas.size


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(1)
    size = key_green(sys.argv[1], sys.argv[2],
                     int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 512,
                     '--trim-watermark' in sys.argv)
    print(f'ok -> {sys.argv[2]} {size[0]}x{size[1]}')
