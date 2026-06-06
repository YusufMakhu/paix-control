"""Genera iconos PWA (badge morado con carita) en icons/."""
import os, math
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT, exist_ok=True)


def make(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # fondo morado redondeado
    r = int(size * 0.18)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=(142, 36, 170, 255))
    # disco oscuro (la pantalla)
    cx = cy = size / 2
    R = size * 0.34
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(18, 16, 26, 255))
    # anillo de LEDs (puntos morado claro)
    ringR = size * 0.40
    dot = max(2, int(size * 0.018))
    for i in range(32):
        a = math.radians(i * 11.25)
        x = cx + math.cos(a) * ringR
        y = cy + math.sin(a) * ringR
        d.ellipse([x - dot, y - dot, x + dot, y + dot], fill=(200, 130, 240, 255))
    # carita amarilla (ojos + sonrisa)
    eye = size * 0.035
    for ex in (cx - R * 0.4, cx + R * 0.4):
        ey = cy - R * 0.25
        d.ellipse([ex - eye, ey - eye, ex + eye, ey + eye], fill=(255, 230, 109, 255))
    sw = max(3, int(size * 0.03))
    d.arc([cx - R * 0.5, cy - R * 0.45, cx + R * 0.5, cy + R * 0.55],
          start=20, end=160, fill=(255, 230, 109, 255), width=sw)
    img.save(os.path.join(OUT, f"icon-{size}.png"))
    print("escrito", os.path.join(OUT, f"icon-{size}.png"))


for s in (192, 512):
    make(s)
