# 운동 마스터 DB 재생성

1. 이 폴더에 `exercise_review_dataset.json`과 `rehab.json`을 둡니다. `rehab.json`은 rehab-db.ts의 `REHAB_EXERCISES`를 JSON으로 덤프한 파일입니다.
2. 아래 명령을 실행합니다.

```
DATASET=exercise_review_dataset.json python3 build.py   # → master.json, report.json
REPO=../.. python3 gen_ts.py                             # → out/lib/exercises/*
```

- 번역을 고치려면 `overrides.json`에 `"데이터셋ID": "한국어 이름"`을 추가합니다.
- 재활 대조표(EXACT/SIMILAR)와 내부 중복표는 `build.py` 상단에 있습니다. GIF를 육안으로 확인한 결과이므로 바꿀 때도 GIF를 보고 판단하세요.
