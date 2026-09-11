"""Génère icons/icon-192.png et icons/icon-512.png sans dépendance externe.
Motif : fond vert, soleil blanc qui se lève sur une ligne d'horizon."""
import os, struct, zlib

BG = (31, 107, 90)
FG = (255, 255, 255)
SS = 3  # sur-échantillonnage pour lisser les bords


def png_bytes(w, h, rows):
    raw = b''.join(b'\x00' + bytes(v for px in row for v in px) for row in rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def coverage(x, y, size):
    """Fraction du pixel (x, y) couverte par le motif blanc."""
    cx, cy, r = size * 0.5, size * 0.56, size * 0.19
    horizon = size * 0.60
    bar_h = size * 0.035
    hit = 0
    for i in range(SS):
        for j in range(SS):
            px, py = x + (i + 0.5) / SS, y + (j + 0.5) / SS
            in_sun = (px - cx) ** 2 + (py - cy) ** 2 <= r * r and py < horizon
            in_bar = abs(py - (horizon + bar_h)) <= bar_h / 2 and size * 0.22 <= px <= size * 0.78
            if in_sun or in_bar:
                hit += 1
    return hit / (SS * SS)


def make(size):
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            a = coverage(x, y, size)
            row.append(tuple(round(BG[k] * (1 - a) + FG[k] * a) for k in range(3)) + (255,))
        rows.append(row)
    return png_bytes(size, size, rows)


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
    os.makedirs(out, exist_ok=True)
    for s in (192, 512):
        with open(os.path.join(out, f'icon-{s}.png'), 'wb') as f:
            f.write(make(s))
        print('ok', s)
