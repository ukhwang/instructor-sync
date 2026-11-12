"""master.json -> lib/exercises/master-db.ts + master-db.instructions.json (+ 교정된 rehab-db.ts)."""
import json, re, os

OUT = os.environ.get("OUT", "out/lib/exercises")
os.makedirs(OUT, exist_ok=True)
m = json.load(open("master.json"))
REGIONS = ["허리/코어", "고관절/둔근", "어깨/흉추", "무릎/하체", "목/상체", "가슴", "등", "팔", "유산소"]
EQUIPS = ["맨몸", "덤벨", "바벨", "케이블", "머신", "밴드", "케틀벨", "짐볼", "메디신볼", "폼롤러", "보수볼", "AB롤러",
          "중량", "어시스트", "유산소 기구", "기타"]
targets = sorted({e["target"] for e in m if e["target"]})

def js(s):
    return json.dumps(s, ensure_ascii=False)

rehab_lines = ["const REHAB_MEDIA: Readonly<Record<string, RehabMediaFix>> = {"]
for e in m:
    if e["source"] != "rehab":
        continue
    md = e["media"]
    rehab_lines.append(
        f'  {js(e["id"])}: {{ code: {js(md["gif"])}, match: {js(md["match"])}, datasetId: {js(md["datasetId"])}, '
        f'keepPoster: {js(md["posterUrl"])}, region: {js(e["region"])}, equipment: {js(e["equipment"])}, '
        f'equipmentDetail: {js(e["equipmentDetail"])}, aliases: {js(e["aliases"])} }},')
rehab_lines.append("};")

rows = ["const ROWS: readonly Row[] = ["]
for e in m:
    if e["source"] != "gym":
        continue
    d, md = e["defaults"], e["media"]
    row = [e["id"], e["nameKo"], e["nameEn"], REGIONS.index(e["region"]), EQUIPS.index(e["equipment"]),
           e["equipmentDetail"], targets.index(e["target"]) if e["target"] else -1, md["gif"], md["alt"] or "",
           d["sets"], d["reps"], d["restSec"]]
    rows.append("  [" + ",".join(js(v) for v in row) + "],")
rows.append("];")

tpl = open("master-db.template.ts").read()
ts = (tpl.replace("/*__REHAB_MEDIA__*/", "\n".join(rehab_lines))
         .replace("/*__TARGETS__*/", f"const TARGETS: readonly string[] = {js(targets)};")
         .replace("/*__ROWS__*/", "\n".join(rows)))
open(f"{OUT}/master-db.ts", "w").write(ts)

instr = {e["id"]: e["instruction"] for e in m if e["source"] == "gym"}
json.dump(instr, open(f"{OUT}/master-db.instructions.json", "w"), ensure_ascii=False, separators=(",", ":"))

# rehab-db.ts 교정본: gifUrl/posterUrl 두 줄만 교체 (다른 필드는 바이트 단위로 그대로)
src = open(os.path.join(os.environ.get("REPO", "../.."), "lib/exercises/rehab-db.ts")).read()
fixed = src
for e in m:
    if e["source"] != "rehab":
        continue
    md = e["media"]
    gif = f'`${{GIF_BASE}}/{md["gif"]}.gif`' if md["gif"] else '""'
    poster = (f'`${{IMG_BASE}}/{md["poster"]}.jpg`' if md["gif"]
              else (js(md["posterUrl"]).replace('"https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/', '`${POSTER_BASE}/').replace('.jpg"', '.jpg`') if md["posterUrl"] else '""'))
    pat = re.compile(r'(id: "' + re.escape(e["id"]) + r'",[\s\S]*?)gifUrl: [^\n]+\n(\s*)posterUrl: [^\n]+\n')
    fixed, n = pat.subn(lambda mm: f'{mm.group(1)}gifUrl: {gif},\n{mm.group(2)}posterUrl: {poster},\n', fixed, count=1)
    assert n == 1, e["id"]
open(f"{OUT}/rehab-db.ts", "w").write(fixed)

print("master-db.ts", os.path.getsize(f"{OUT}/master-db.ts"), "bytes")
print("instructions.json", os.path.getsize(f"{OUT}/master-db.instructions.json"), "bytes")
print("targets", len(targets), "rows", len(rows) - 2)
