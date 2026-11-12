"""1,318 헬스 DB + 재활 34종 -> 통합 마스터 DB (JSON) + 검토 리포트."""
import json, os, re, sys, collections
sys.path.insert(0, ".")
from translate import translate

W = "."
DATA = json.load(open(os.environ.get("DATASET", "exercise_review_dataset.json")))["exercises"]
REHAB = json.load(open("rehab.json"))
OVR = json.load(open("overrides.json"))
BY_ID = {x["id"]: x for x in DATA}

GIF_BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/"
IMG_BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/images/"

def media_code(gif_url):  # "0276-iny3m5y"
    m = re.search(r"/videos/(\d{4}-[A-Za-z0-9]+)\.gif$", gif_url)
    assert m, gif_url
    return m.group(1)

# ── 1. 데이터셋 내부 중복 (GIF로 확인: 같은 동작, 다른 모델/각도) ──────────────
INTERNAL_DUPS = {"2800": "2799", "1731": "0296", "1680": "0422", "1307": "0653", "2801": "2802"}

# ── 2. 재활 34종 ↔ 데이터셋 대조 (GIF 육안 확인 결과) ─────────────────────────
EXACT = {  # 같은 운동 -> 중복 제거, 재활 항목 유지 + 데이터셋 GIF 병합
    "rehab-dead-bug": "0276", "rehab-pelvic-tilt": "3147", "rehab-mcgill-curlup": "3016",
    "rehab-side-plank": "0705", "rehab-glute-bridge": "3013", "rehab-frog-stretch": "2571",
    "rehab-scapular-pushup": "3021", "rehab-calf-raise": "1373", "rehab-upper-trap-stretch": "0716",
    "rehab-standard-pushup": "0662", "rehab-knee-pushup": "3211", "rehab-wall-pushup": "0659",
    "rehab-diamond-pushup": "0283",
}
SIMILAR = {  # 자세는 같지만 다른 운동 -> 둘 다 유지, GIF는 참고용으로 빌려옴
    "rehab-bear-hold": "3360", "rehab-piriformis-stretch": "1710", "rehab-hip-flexor-lunge": "1559",
    "rehab-prone-y-raise": "3541", "rehab-band-external-rotation": "0235", "rehab-wall-squat": "0624",
    "rehab-ankle-dorsiflexion": "1377",
}
KEEP_POSTER = {"rehab-bird-dog", "rehab-cat-cow"}  # 네발 시작 자세 포스터는 유효

# ── 3. 부위 분류 ─────────────────────────────────────────────────────────────
KNEE_PATTERNS = r"squat|lunge|leg press|leg wide press|step-up|step up|split|pistol|hack|sissy|jump|leg extension|curtsey|cossack|hamstring curl|platform slide|wall sit|march sit"
HINGE_PATTERNS = r"deadlift|good morning|pull through|swing|hyperextension|hyper extension|reverse hyper|hip extension|back extension"

def region_of(x):
    bp, tg, n = x["body_part"], x["target"], x["name_en"].lower()
    if bp == "waist":
        return "허리/코어"
    if bp == "chest":
        return "가슴"
    if bp == "back":
        return "허리/코어" if tg == "spine" else "등"
    if bp == "shoulders":
        return "어깨/흉추"
    if bp in ("upper arms", "lower arms"):
        return "팔"
    if bp == "neck":
        return "목/상체"
    if bp == "cardio":
        return "유산소"
    if bp == "lower legs":
        return "무릎/하체"
    if bp == "upper legs":
        if tg in ("adductors", "abductors"):
            return "고관절/둔근"
        if re.search(r"push[- ]?up", n):
            return "가슴"
        if re.search(r"flutter kicks|swimmer kicks", n):
            return "허리/코어"
        if re.search(KNEE_PATTERNS, n):
            return "무릎/하체"
        if re.search(HINGE_PATTERNS, n):
            return "고관절/둔근"
        if tg in ("quads", "hamstrings", "calves"):
            return "무릎/하체"
        return "고관절/둔근"
    raise ValueError(bp)

# 이름과 부위가 명백히 어긋나는 항목 수동 교정 (검증 단계에서 확인)
REGION_FIX = {}

TARGET_KO = {
    "abs": "복근", "pectorals": "대흉근", "biceps": "이두", "glutes": "둔근", "delts": "삼각근", "triceps": "삼두",
    "upper back": "상부 등", "lats": "광배근", "calves": "종아리", "quads": "대퇴사두", "forearms": "전완",
    "cardiovascular system": "심폐", "hamstrings": "햄스트링", "spine": "척추기립근", "traps": "승모근",
    "adductors": "내전근", "serratus anterior": "전거근", "abductors": "외전근", "levator scapulae": "견갑거근",
}

# ── 4. 기구 분류 ─────────────────────────────────────────────────────────────
EQUIP = {  # equipment_en -> (그룹, 상세)
    "body weight": ("맨몸", "맨몸"), "dumbbell": ("덤벨", "덤벨"), "barbell": ("바벨", "바벨"),
    "olympic barbell": ("바벨", "올림픽 바벨"), "ez barbell": ("바벨", "EZ바"), "trap bar": ("바벨", "트랩바"),
    "cable": ("케이블", "케이블"), "leverage machine": ("머신", "머신"), "smith machine": ("머신", "스미스머신"),
    "sled machine": ("머신", "레그프레스·핵 머신"), "band": ("밴드", "밴드"), "resistance band": ("밴드", "밴드"),
    "kettlebell": ("케틀벨", "케틀벨"), "stability ball": ("짐볼", "짐볼"), "medicine ball": ("메디신볼", "메디신볼"),
    "roller": ("폼롤러", "폼롤러"), "wheel roller": ("AB롤러", "AB롤러"), "bosu ball": ("보수볼", "보수볼"),
    "weighted": ("중량", "원판·중량 조끼"), "assisted": ("어시스트", "어시스트"), "rope": ("기타", "로프"),
    "hammer": ("기타", "해머"), "tire": ("기타", "타이어"),
    "stationary bike": ("유산소 기구", "실내 자전거"), "elliptical machine": ("유산소 기구", "일립티컬"),
    "stepmill machine": ("유산소 기구", "스텝밀"), "skierg machine": ("유산소 기구", "스키에르그"),
    "upper body ergometer": ("유산소 기구", "상체 에르고미터"),
}
NAME_EQUIP = [  # 이름에 기구가 명시되면 우선 (데이터셋 equipment 오분류 교정)
    (r"\bsmith\b", ("머신", "스미스머신")), (r"\bsled\b", ("머신", "레그프레스·핵 머신")),
    (r"\blever\b|\bmachine\b(?! ball)", ("머신", "머신")), (r"\bez[ -]?bar", ("바벨", "EZ바")),
    (r"\bbarbell\b", ("바벨", "바벨")), (r"\bdumbbells?\b", ("덤벨", "덤벨")), (r"\bkettlebell\b", ("케틀벨", "케틀벨")),
    (r"\bcable\b", ("케이블", "케이블")), (r"\bband\b", ("밴드", "밴드")), (r"\bmedicine ball\b", ("메디신볼", "메디신볼")),
    (r"\bbosu\b", ("보수볼", "보수볼")), (r"(stability|exercise) ball", ("짐볼", "짐볼")),
    (r"\bwheel\b", ("AB롤러", "AB롤러")), (r"\broller\b", ("폼롤러", "폼롤러")),
]

EQUIP_KEEP = {"3297", "3296", "3295", "2400"}  # 체조 레버(front/back lever), 맨몸 노르딕컬: 이름의 lever/machine은 기구 아님

def equipment_of(x):
    base = EQUIP[x["equipment_en"]]
    n = x["name_en"].lower()
    if x["id"] in EQUIP_KEEP:
        return base, None
    hits = [eq for pat, eq in NAME_EQUIP if re.search(pat, n)]
    if hits and base[0] not in {h[0] for h in hits}:
        return hits[0], base  # (교정값, 원래값)
    return base, None

REHAB_EQUIP = {"맨몸": ("맨몸", "맨몸"), "매트": ("맨몸", "매트"), "밴드": ("밴드", "밴드"),
               "폼롤러": ("폼롤러", "폼롤러"), "벽/의자": ("맨몸", "벽·의자")}

# ── 5. 기본 처방값 (헬스 DB는 일반값, 재활은 검증값 보존) ─────────────────────
def generic_defaults(x, region):
    n = x["name_en"].lower()
    if region == "유산소" or re.search(r"\b(run|walk|bike|elliptical|stepmill|ergometer|sprint|jump rope)\b", n):
        return {"sets": 1, "reps": "10분", "restSec": 60}
    if re.search(r"stretch|pose|yoga|circles", n):
        return {"sets": 2, "reps": "30초", "restSec": 15}
    if re.search(r"plank|hold|isometric|wall sit|l-sit|v-sit|lever|planche|maltese|handstand$|flag", n):
        return {"sets": 3, "reps": "30초", "restSec": 45}
    if re.search(r"\b(one arm|one leg|single arm|single leg|alternate|alternating|unilateral)\b", n):
        return {"sets": 3, "reps": "10회 (각)", "restSec": 60}
    return {"sets": 3, "reps": "12회", "restSec": 60}

# ── 빌드 ────────────────────────────────────────────────────────────────────
merged_into = {v: k for k, v in EXACT.items()}
alt_gif = {keep: media_code(BY_ID[drop]["gif_url"]) for drop, keep in INTERNAL_DUPS.items()}
report = {"internalDups": [], "rehabMerged": [], "rehabSimilar": [], "rehabNoMedia": [],
          "equipmentFixed": [], "regionChanged": collections.Counter(), "nameCollisions": []}

for drop, keep in INTERNAL_DUPS.items():
    report["internalDups"].append({"dropped": drop, "droppedName": BY_ID[drop]["name_en"],
                                   "kept": keep, "keptName": BY_ID[keep]["name_en"]})

out = []

# 재활 34종 (모든 원본 필드 보존 + 미디어 교정)
for r in REHAB:
    rid = r["id"]
    original = dict(r)
    ds = EXACT.get(rid) or SIMILAR.get(rid)
    match = "exact" if rid in EXACT else "similar" if rid in SIMILAR else "none"
    if ds:
        code = media_code(BY_ID[ds]["gif_url"])
        gif, poster = code, code
    else:
        gif, poster = None, None
    keep_poster_url = r["posterUrl"] if rid in KEEP_POSTER else None
    eg, ed = REHAB_EQUIP[r["equipment"]]
    aliases = [r["englishName"]]
    if match == "exact":
        dsx = BY_ID[ds]
        aliases += [dsx["name_en"], OVR.get(ds) or translate(dsx["name_en"])]
        report["rehabMerged"].append({"rehabId": rid, "nameKo": r["koreanOnlyName"], "datasetId": ds,
                                      "datasetName": dsx["name_en"], "oldGif": r["gifUrl"].rsplit("/", 1)[-1]})
    elif match == "similar":
        report["rehabSimilar"].append({"rehabId": rid, "nameKo": r["koreanOnlyName"], "datasetId": ds,
                                       "datasetName": BY_ID[ds]["name_en"], "oldGif": r["gifUrl"].rsplit("/", 1)[-1]})
    else:
        report["rehabNoMedia"].append({"rehabId": rid, "nameKo": r["koreanOnlyName"],
                                       "oldGif": r["gifUrl"].rsplit("/", 1)[-1]})
    out.append({
        "id": rid, "source": "rehab", "nameKo": r["koreanOnlyName"], "nameEn": r["englishName"],
        "region": r["category"], "equipment": eg, "equipmentDetail": ed, "target": None,
        "media": {"gif": gif, "poster": poster, "posterUrl": keep_poster_url, "match": match, "datasetId": ds,
                  "alt": None},
        "defaults": {"sets": r["defaultSets"], "reps": r["defaultReps"], "restSec": r["defaultRestSec"],
                     "cue": r["defaultCue"]},
        "coachingTags": r["coachingTags"], "tags": r["tags"], "painAreas": r["painAreas"],
        "difficulty": r["difficulty"], "aliases": sorted(set(a for a in aliases if a)),
        "rehab": {k: v for k, v in original.items() if k not in ("gifUrl", "posterUrl")},
        "instruction": r["instruction"],
    })

# 헬스 DB
for x in DATA:
    i = x["id"]
    if i in INTERNAL_DUPS or i in merged_into:
        continue
    region = REGION_FIX.get(i) or region_of(x)
    if region != {"허리/복부": "허리/코어", "가슴/대흉근": "가슴", "등/광배": "등", "어깨/삼각근": "어깨/흉추",
                  "팔/상완": "팔", "팔/전완": "팔", "목/경추": "목/상체", "유산소/전신": "유산소",
                  "종아리/발목": "무릎/하체"}.get(x["category_ko"], region):
        report["regionChanged"][f'{x["category_ko"]} -> {region}'] += 1
    (eg, ed), orig = equipment_of(x)
    if orig:
        report["equipmentFixed"].append({"id": i, "name": x["name_en"], "from": f'{x["equipment_en"]}',
                                         "to": ed})
    name_ko = OVR.get(i) or translate(x["name_en"])
    d = generic_defaults(x, region)
    out.append({
        "id": f"ex-{i}", "source": "gym", "nameKo": name_ko, "nameEn": x["name_en"].replace("45в°", "45°"),
        "region": region, "equipment": eg, "equipmentDetail": ed, "target": TARGET_KO[x["target"]],
        "media": {"gif": media_code(x["gif_url"]), "poster": media_code(x["gif_url"]), "posterUrl": None,
                  "match": "exact", "datasetId": i, "alt": alt_gif.get(i)},
        "defaults": {**d, "cue": None},
        "coachingTags": [], "tags": [], "painAreas": [], "difficulty": None, "aliases": [],
        "rehab": None, "instruction": x["instructions_ko"],
    })

# 한국어 이름 고유성 검사
seen = collections.defaultdict(list)
for e in out:
    seen[e["nameKo"]].append(e["id"])
report["nameCollisions"] = {k: v for k, v in seen.items() if len(v) > 1}
report["regionChanged"] = dict(report["regionChanged"])
report["totals"] = {
    "datasetRaw": len(DATA), "internalDupsRemoved": len(INTERNAL_DUPS), "rehab": len(REHAB),
    "rehabExactMerged": len(EXACT), "rehabSimilar": len(SIMILAR), "rehabNoMatch": len(REHAB) - len(EXACT) - len(SIMILAR),
    "final": len(out),
    "byRegion": dict(collections.Counter(e["region"] for e in out)),
    "byEquipment": dict(collections.Counter(e["equipment"] for e in out)),
}
json.dump(out, open("master.json", "w"), ensure_ascii=False, indent=1)
json.dump(report, open("report.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(report["totals"], ensure_ascii=False, indent=1))
print("collisions:", report["nameCollisions"])
print("equipment fixed:", len(report["equipmentFixed"]))
print("region changed:", report["regionChanged"])
