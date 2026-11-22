"""Розпізнавання таблиці правильних відповідей (скан PDF).
Таблиця: пари рядків "Питання" / "Відповідь", по 8 стовпців.
Відповіді - одна цифра 1..5, тому замість OCR використовуємо простий класифікатор
гліфів (кластеризація + еталони), а номери питань звіряємо з кількістю питань у розділах.
Запуск: python tools/parse_answers.py
"""
import json, sys
from pathlib import Path
import cv2, numpy as np, pymupdf

ROOT = Path(__file__).resolve().parent.parent
SRC = next((ROOT / "source").glob("Numer*.pdf"))
OUT = ROOT / "data" / "answer_cells.npz"


def groups(idx, gap=6):
    out, cur = [], []
    for i in idx:
        if cur and i - cur[-1] > gap:
            out.append(int(np.mean(cur))); cur = []
        cur.append(i)
    if cur:
        out.append(int(np.mean(cur)))
    return out


def blobs(cell):
    n, lab, st, _ = cv2.connectedComponentsWithStats(cell, 8)
    return [st[i] for i in range(1, n) if st[i][4] > 25 and st[i][3] > 12]


def glyph(cell, b):
    x, y, w, h, _ = b
    g = cell[y:y + h, x:x + w]
    s = max(w, h)
    canvas = np.zeros((s, s), np.uint8)
    canvas[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = g
    return cv2.resize(canvas, (24, 24), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


def deskew(gray):
    """Скан трохи перекошений: шукаємо кут, за якого горизонтальні лінії найчіткіші."""
    small = cv2.resize(gray, None, fx=0.5, fy=0.5)
    inv = 255 - small
    best, best_a = -1, 0.0
    hh, ww = inv.shape
    for a in np.arange(-1.5, 1.51, 0.05):
        M = cv2.getRotationMatrix2D((ww / 2, hh / 2), a, 1)
        r = cv2.warpAffine(inv, M, (ww, hh))
        score = np.var(r.sum(1).astype(np.float64))
        if score > best:
            best, best_a = score, a
    h, w = gray.shape
    M = cv2.getRotationMatrix2D((w / 2, h / 2), best_a, 1)
    return cv2.warpAffine(gray, M, (w, h), borderValue=255), best_a


def main():
    doc = pymupdf.open(SRC)
    rows_meta, glyphs = [], []
    for pno in range(doc.page_count):
        pix = doc[pno].get_pixmap(dpi=200, colorspace=pymupdf.csGRAY)
        gray = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w)
        gray, ang = deskew(gray)
        bw = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 25, 15)
        h, w = bw.shape
        hor = cv2.morphologyEx(bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (w // 12, 1)))
        ver = cv2.morphologyEx(bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, h // 40)))
        cs = ver.sum(0); xs = groups(np.where(cs > 0.35 * cs.max())[0])[-9:]
        print(pno, round(float(ang), 2), file=sys.stderr)
        x0, x1 = xs[0], xs[-1]
        ys = groups(np.where(hor[:, x0:x1].sum(1) > 255 * (x1 - x0) * 0.6)[0])
        clean = bw.copy(); clean[hor > 0] = 0; clean[ver > 0] = 0
        if "--overlay" in sys.argv:
            vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
            for y in ys: cv2.line(vis, (x0, y), (x1, y), (0, 0, 255), 2)
            for x in xs: cv2.line(vis, (x, 0), (x, h), (255, 0, 0), 2)
            cv2.imwrite(str(ROOT / "_work" / f"ov{pno}.png"), cv2.resize(vis, None, fx=0.5, fy=0.5))
        for ya, yb in zip(ys, ys[1:]):
            if yb - ya < 20:
                continue
            row = []
            for xa, xb in zip(xs, xs[1:]):
                c = clean[ya + 4:yb - 3, xa + 3:xb + 4]
                bl = blobs(c)
                ink = int((c > 0).sum())
                gi = -1
                if bl:
                    big = max(bl, key=lambda b: b[4])
                    gi = len(glyphs); glyphs.append(glyph(c, big))
                row.append([len(bl), gi, ink])
            rows_meta.append({"page": pno, "y": ya, "y2": yb, "cells": row})
    np.savez_compressed(OUT, glyphs=np.array(glyphs))
    (ROOT / "data" / "answer_rows.json").write_text(json.dumps(rows_meta), "utf-8")
    print("rows", len(rows_meta), "glyphs", len(glyphs))


if __name__ == "__main__":
    main()
