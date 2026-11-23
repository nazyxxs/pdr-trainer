"""Парсер офіційних тестових питань ПДР (PDF ГСЦ МВС) -> JSON + картинки.
Запуск: python tools/parse_questions.py
"""
import bisect, json, re, sys
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parent.parent
SRC = next((ROOT / "source").glob("POLOTNO*.pdf"))
OUT_IMG = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public" / "img"
OUT_JSON = ROOT / "data" / "questions_raw.json"

RE_SECTION = re.compile(r"^(\d+)\.\s*((?:\d+\.\s*)?[А-ЯІЇЄҐA-Z][^a-zа-яіїєґ]{2,})$")  # "1. ЗАГАЛЬНІ ПОЛОЖЕННЯ"
RE_UPPER = re.compile(r"^[^a-zа-яіїєґ]{3,}$")
RE_QUESTION = re.compile(r"^(\d+)\.\s*(.*)$")
RE_OPTION = re.compile(r"^([1-9])[).]\s*(.*)$")
RE_OPTION_TAIL = re.compile(r"^(.*\S)\s+([1-9])\)$")  # "Текст відповіді. 2)"


def page_lines(page):
    """Рядки сторінки, зведені за y (щоб '13.' і текст в одному рядку злились)."""
    raw = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            txt = "".join(s["text"] for s in l["spans"])
            if not txt.strip():
                continue
            bold = any("Bold" in s["font"] or s["flags"] & 16 for s in l["spans"] if s["text"].strip())
            raw.append([l["bbox"][1], l["bbox"][0], l["bbox"][3], txt, bold])
    raw.sort(key=lambda r: (round(r[0]), r[1]))
    merged = []
    for y, x, y2, t, bold in raw:
        if merged and abs(merged[-1]["y"] - y) < 3:
            m = merged[-1]
            m["text"] = (m["text"].rstrip() + " " + t.strip()).strip()
            m["bold"] = m["bold"] or bold
            m["y2"] = max(m["y2"], y2)
        else:
            merged.append({"y": y, "y2": y2, "x": x, "text": t.strip(), "bold": bold})
    # прибрати номер сторінки зверху
    return [m for m in merged if not (m["y"] < 55 and re.fullmatch(r"\d+", m["text"]))]


def join(parts):
    s = " ".join(p.strip() for p in parts if p.strip())
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"(\w)- (\w)", r"\1-\2", s)  # перенесення через дефіс
    return s.strip()


def main():
    doc = pymupdf.open(SRC)
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    sections, questions = [], []
    cur_sec = None
    cur_q = None
    mode = None  # 'q' або 'opt'

    def finish_q():
        if cur_q:
            plain = cur_q.pop("_plain", [])
            if not cur_q["_o"] and len(plain) >= 2:
                # варіанти без нумерації: кожен звичайний (не жирний) рядок - окремий варіант
                cur_q["_t"] = [x for x in cur_q["_t"] if x not in plain]
                cur_q["_o"] = [[x] for x in plain]
            cur_q["text"] = join(cur_q.pop("_t"))
            cur_q["options"] = [re.sub(r"[»”]\.?$", "", join(o)).strip() for o in cur_q.pop("_o")]
            questions.append(cur_q)

    for pno in range(doc.page_count):
        page = doc[pno]
        for ln in page_lines(page):
            t = ln["text"]
            ms = RE_SECTION.match(t)
            if ln["bold"] and ms and not t.endswith((":", "?")):
                finish_q(); cur_q = None
                cur_sec = {"id": len(sections) + 1, "num": int(ms.group(1)), "title": ms.group(2).strip()}
                sections.append(cur_sec)
                continue
            mq = RE_QUESTION.match(t)
            if ln["bold"] and mq and (mode != "q" or cur_q is None or int(mq.group(1)) == cur_q["num"] + 1):
                finish_q()
                cur_q = {"section": cur_sec["id"], "num": int(mq.group(1)), "_t": [mq.group(2)], "_o": [],
                         "_regions": [[pno, ln["y"], None]]}
                mode = "q"
                continue
            if cur_q is None:
                if cur_sec and ln["bold"] and RE_UPPER.match(t) and not re.match(r"^[\d.\s]+$", t):
                    cur_sec["title"] += " " + t  # заголовок розділу на кількох рядках
                continue
            nxt = len(cur_q["_o"]) + 1
            mo = RE_OPTION.match(t)
            if mo and int(mo.group(1)) == nxt and (not ln["bold"] or nxt == 1):
                cur_q.setdefault("_opt_y", (pno, ln["y"]))
                cur_q["_o"].append([mo.group(2)]); mode = "opt"
                continue
            mt = RE_OPTION_TAIL.match(t)
            if mt and not ln["bold"] and int(mt.group(2)) == nxt:
                cur_q["_o"].append([mt.group(1)]); mode = "opt"
                continue
            if mode == "q":
                if cur_q["_regions"][-1][0] != pno:
                    cur_q["_regions"].append([pno, 0, None])
                cur_q["_t"].append(t)
                if not ln["bold"]:
                    cur_q.setdefault("_plain", []).append(t)
                    cur_q.setdefault("_plain_y", (pno, ln["y"]))
            else:
                if cur_q["_regions"][-1][0] != pno:
                    cur_q["_regions"].append([pno, 0, None])
                cur_q["_o"][-1].append(t)
    finish_q()

    # картинки: кожне зображення належить останньому питанню, що почалося ДО нього
    # (враховує картинки, перенесені на наступну сторінку, навіть на сторінку без тексту)
    starts = sorted((q["_regions"][0][0], q["_regions"][0][1], i) for i, q in enumerate(questions))
    keys = [(p_, y_) for p_, y_, _ in starts]
    found = {}
    for pno in range(doc.page_count):
        for info in doc[pno].get_image_info():
            x0, iy0, x1, iy1 = info["bbox"]
            if x1 - x0 < 8 or iy1 - iy0 < 8:
                continue
            cy = (iy0 + iy1) / 2
            k = bisect.bisect_right(keys, (pno, cy + 2)) - 1
            if k >= 0:
                found.setdefault(starts[k][2], []).append((pno, pymupdf.Rect(info["bbox"])))
    for i, q in enumerate(questions):
        q.pop("_regions")
        rects = found.get(i, [])
        q["image"] = None
        if rects:
            pages = sorted({p for p, _ in rects})
            pno = max(pages, key=lambda p: sum(r.get_area() for pp, r in rects if pp == p))
            box = pymupdf.Rect()
            for pp, r in rects:
                if pp == pno:
                    box |= r
            opt_y = q.pop("_opt_y", None) or q.get("_plain_y")
            if opt_y and opt_y[0] == pno and opt_y[1] > box.y0 + 20:
                box.y1 = min(box.y1, opt_y[1] - 1)  # не захоплювати текст варіантів
            box = box & doc[pno].rect
            name = f"s{q['section']}_q{q['num']}.jpg"
            pix = doc[pno].get_pixmap(clip=box, dpi=150)
            pix.save(OUT_IMG / name, jpg_quality=82)
            q["image"] = f"img/{name}"

    for q in questions:
        q.pop("_plain_y", None); q.pop("_opt_y", None)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps({"sections": sections, "questions": questions}, ensure_ascii=False, indent=1), "utf-8")
    print(f"sections={len(sections)} questions={len(questions)} with_img={sum(1 for q in questions if q['image'])}")


if __name__ == "__main__":
    main()
