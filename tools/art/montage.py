"""把一批生成图拼成联系表（contact sheet），方便一次看完再决定每个文件是谁。

用法：
  python tools/art/montage.py <目录> <输出.png> [每行张数]
只统计目录顶层的 png，按修改时间排序，并在每格左上角标出序号。
同时打印「序号 -> 文件名」的映射，便于改名。
"""
import sys
import os
import glob
from PIL import Image, ImageDraw

def main():
    folder = sys.argv[1]
    out = sys.argv[2]
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    files = [f for f in glob.glob(os.path.join(folder, '*.png')) if os.path.isfile(f)]
    files.sort(key=lambda f: os.path.getmtime(f))
    if not files:
        print('没有 png')
        return

    cell_w, cell_h = 360, 540
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell_w, rows * cell_h), (18, 20, 26))
    draw = ImageDraw.Draw(sheet)

    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB')
        im.thumbnail((cell_w - 16, cell_h - 40))
        x = (i % cols) * cell_w + (cell_w - im.width) // 2
        y = (i // cols) * cell_h + 34
        sheet.paste(im, (x, y))
        draw.text(((i % cols) * cell_w + 8, (i // cols) * cell_h + 8), f'#{i}', fill=(255, 255, 255))

    sheet.save(out)
    print('联系表:', out)
    for i, f in enumerate(files):
        print(f'#{i}  {os.path.basename(f)}')

if __name__ == '__main__':
    main()
