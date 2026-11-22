"""Зводить питання + відповіді в public/questions.json для сайту.
Відповіді сторінок 1-10 скану: класифікатор гліфів (tools/parse_answers.py + кластеризація),
кластери підписані вручну. Остання (бліда) сторінка - data/answers_page11_manual.json.
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"

CLUSTER_DIGIT = {0: 3, 1: 1, 2: 2, 3: 4, 4: 3, 5: 2, 6: 1, 7: 2, 8: 5, 9: 5}
# клітинки, які класифікатор не прочитав, перевірені очима: індекс відповіді -> цифра
MANUAL_FIX = {556: 2, 582: 3, 775: 2, 1070: 2, 1135: 2, 1185: 3, 1414: 2, 1446: 2, 1834: 2, 1965: 2, 2140: 3}
# в скані нечитабельно, відповідь встановлена за змістом питання
INFERRED = {(55, 39): 4, (56, 24): 1}

raw = json.loads((D / "questions_raw.json").read_text("utf-8"))
qs = raw["questions"]
lab = np.load(D / "answer_clusters_lab.npy"); idx = np.load(D / "answer_clusters_idx.npy")
answers = [CLUSTER_DIGIT[int(l)] if i >= 0 else None for l, i in zip(lab, idx)]
for k, v in MANUAL_FIX.items():
    answers[k] = v

manual = json.loads((D / "answers_page11_manual.json").read_text("utf-8"))
key = {(q["section"], q["num"]): n for n, q in enumerate(qs)}
answers += [None] * (len(qs) - len(answers))
for s, blocks in manual.items():
    if s.startswith("_"):
        continue
    for start, arr in blocks.items():
        for i, a in enumerate(arr):
            answers[key[(int(s), int(start) + i)]] = a
for k, v in INFERRED.items():
    answers[key[k]] = v

assert len(answers) == len(qs) and all(answers), "є питання без відповіді"
out = []
for q, a in zip(qs, answers):
    assert 1 <= a <= len(q["options"]), (q["section"], q["num"], a)
    out.append({"id": f"{q['section']}-{q['num']}", "s": q["section"], "n": q["num"], "q": q["text"],
                "o": q["options"], "a": a - 1, "img": q["image"]})
sections = [{"id": s["id"], "num": s["num"], "title": s["title"].strip()} for s in raw["sections"]]
(ROOT / "public").mkdir(exist_ok=True)
(ROOT / "public" / "questions.json").write_text(
    json.dumps({"version": "наказ ГСЦ МВС від 29.10.2025 № 225", "sections": sections, "questions": out},
               ensure_ascii=False, separators=(",", ":")), "utf-8")
print("questions", len(out))
