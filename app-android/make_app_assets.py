"""Genera assets/logo.png (1024) para @capacitor/assets: badge PAIX (disco morado
con anillo de LEDs y carita) sobre fondo transparente."""
import os, math
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "assets")
os.makedirs(OUT, exist_ok=True)
S = 1024


def make_logo():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = S / 2
    body = S * 0.46            # cuerpo morado (badge)
    d.ellipse([cx-body, cy-body, cx+body, cy+body], fill=(142, 36, 170, 255))
    d.ellipse([cx-body, cy-body, cx+body, cy+body], outline=(186, 104, 224, 255), width=int(S*0.012))
    # anillo de LEDs (puntos morado claro)
    ringR = body * 0.86
    dot = S * 0.016
    for i in range(32):
        a = math.radians(i * 11.25)
        x = cx + math.cos(a) * ringR
        y = cy + math.sin(a) * ringR
        d.ellipse([x-dot, y-dot, x+dot, y+dot], fill=(214, 150, 247, 255))
    # disco interior oscuro (la pantalla)
    disc = body * 0.66
    d.ellipse([cx-disc, cy-disc, cx+disc, cy+disc], fill=(18, 16, 26, 255))
    # carita amarilla
    eye = S * 0.028
    for ex in (cx - disc*0.42, cx + disc*0.42):
        ey = cy - disc*0.22
        d.ellipse([ex-eye, ey-eye, ex+eye, ey+eye], fill=(255, 230, 109, 255))
    sw = int(S*0.026)
    d.arc([cx-disc*0.5, cy-disc*0.5, cx+disc*0.5, cy+disc*0.6],
          start=20, end=160, fill=(255, 230, 109, 255), width=sw)
    img.save(os.path.join(OUT, "logo.png"))
    img.save(os.path.join(OUT, "logo-dark.png"))
    print("logo escrito en", OUT)


make_logo()
