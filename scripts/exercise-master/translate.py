"""영문 운동명 -> 국내 헬스장 통용 한국어 명칭 (사전 기반 초벌 + overrides.json 수동 교정)."""
import json, re, sys

# 다단어 구문 (긴 것부터 매칭)
PHRASES = {
    "behind the neck": "비하인드넥", "behind neck": "비하인드넥", "behind head": "비하인드헤드",
    "behind the back": "비하인드백",
    "bent-over": "벤트오버", "bent over": "벤트오버",
    "one arm": "원암", "single arm": "싱글암", "two arm": "투암", "two arms": "투암",
    "one leg": "싱글레그", "single leg": "싱글레그", "single-leg": "싱글레그", "two legs": "양발", "two leg": "양발",
    "close-grip": "클로즈그립", "close grip": "클로즈그립", "wide-grip": "와이드그립", "wide grip": "와이드그립",
    "reverse-grip": "리버스그립", "reverse grip": "리버스그립", "neutral grip": "뉴트럴그립",
    "narrow grip": "내로우그립", "mixed grip": "믹스드그립", "pronate-grip": "오버그립", "clean-grip": "클린그립",
    "underhand grip": "언더그립", "overhand grip": "오버그립", "hammer grip": "해머그립", "parallel grip": "패러렐그립",
    "palm-in": "뉴트럴그립", "palms in": "뉴트럴그립", "palm up": "손바닥 위", "palms up": "손바닥 위",
    "palms down": "손바닥 아래", "palm down": "손바닥 아래",
    "body weight": "맨몸", "bodyweight": "맨몸",
    "ez barbell": "EZ바", "ez-barbell": "EZ바", "ez bar": "EZ바", "ez-bar": "EZ바", "sz-bar": "EZ바",
    "olympic barbell": "올림픽 바벨", "trap bar": "트랩바", "t-bar": "T바", "v-bar": "V바",
    "smith machine": "스미스머신", "smith": "스미스머신",
    "stability ball": "짐볼", "exercise ball": "짐볼", "swiss ball": "짐볼", "bosu ball": "보수볼",
    "medicine ball": "메디신볼", "resistance band": "밴드", "wheel roller": "AB롤러",
    "dip cage": "딥스 스테이션", "pull-up bar": "풀업바", "parallel bars": "평행봉",
    "bench press": "벤치프레스", "chest press": "체스트프레스", "shoulder press": "숄더프레스",
    "military press": "밀리터리프레스", "leg press": "레그프레스", "floor press": "플로어프레스",
    "arnold press": "아놀드프레스", "push press": "푸시프레스", "overhead press": "오버헤드프레스",
    "calf press": "카프프레스", "w-press": "W프레스", "pallof press": "팰로프프레스",
    "lateral raise": "래터럴레이즈", "front raise": "프론트레이즈", "leg raise": "레그레이즈",
    "calf raise": "카프레이즈", "calf raises": "카프레이즈", "rear delt raise": "리어델트 레이즈",
    "upright row": "업라이트로우", "pendlay row": "펜들레이로우", "renegade row": "레니게이드로우",
    "face pull": "페이스풀", "lat pulldown": "랫풀다운", "pulldown": "풀다운",
    "pull-up": "풀업", "pull-ups": "풀업", "pull up": "풀업", "chin-up": "친업", "chin-ups": "친업",
    "muscle-up": "머슬업", "muscle up": "머슬업",
    "push-up": "푸시업", "push up": "푸시업", "push-ups": "푸시업",
    "sit-up": "싯업", "sit up": "싯업", "step-up": "스텝업", "curl-up": "컬업", "v-up": "브이업", "v-sit": "브이싯",
    "l-sit": "L싯", "l-pull-up": "L풀업",
    "biceps curl": "바이셉스컬", "bicep curl": "바이셉스컬", "hammer curl": "해머컬", "preacher curl": "프리처컬",
    "concentration curl": "컨센트레이션컬", "spider curl": "스파이더컬", "drag curl": "드래그컬",
    "leg curl": "레그컬", "wrist curl": "리스트컬", "zottman curl": "조트맨컬", "reverse curl": "리버스컬",
    "triceps extension": "트라이셉스 익스텐션", "tricep extension": "트라이셉스 익스텐션",
    "triceps pushdown": "트라이셉스 푸시다운", "tricep pushdown": "트라이셉스 푸시다운",
    "triceps press": "트라이셉스 프레스", "triceps dip": "트라이셉스 딥스", "triceps kickback": "트라이셉스 킥백",
    "leg extension": "레그익스텐션", "back extension": "백익스텐션", "hip extension": "힙익스텐션",
    "skull crusher": "스컬크러셔", "skullcrusher": "스컬크러셔",
    "front squat": "프론트스쿼트", "hack squat": "핵스쿼트", "split squat": "스플릿스쿼트", "goblet squat": "고블릿스쿼트",
    "sumo squat": "스모스쿼트", "jump squat": "점프스쿼트", "overhead squat": "오버헤드스쿼트", "zercher squat": "저처스쿼트",
    "pistol squat": "피스톨스쿼트", "sissy squat": "시시스쿼트", "box squat": "박스스쿼트",
    "romanian deadlift": "루마니안 데드리프트", "stiff leg deadlift": "스티프레그 데드리프트",
    "stiff-leg deadlift": "스티프레그 데드리프트", "straight leg deadlift": "스트레이트레그 데드리프트",
    "sumo deadlift": "스모 데드리프트", "good morning": "굿모닝",
    "hip thrust": "힙스러스트", "hip thrusts": "힙스러스트", "glute bridge": "글루트브릿지", "glute-ham raise": "GHR",
    "russian twist": "러시안트위스트", "russian twists": "러시안트위스트",
    "mountain climber": "마운틴클라이머", "farmers walk": "파머스워크", "jumping jack": "점핑잭",
    "bicycle crunch": "바이시클크런치", "reverse crunch": "리버스크런치", "toe touch": "토터치",
    "heel touchers": "힐터치", "flutter kicks": "플러터킥", "jack knife": "잭나이프", "jackknife": "잭나이프",
    "windshield wipers": "윈드실드 와이퍼", "turkish get-up": "터키시 겟업", "get up": "겟업",
    "cable crossover": "케이블 크로스오버", "cross-over": "크로스오버", "crossover": "크로스오버", "crossovers": "크로스오버",
    "rear delt": "리어델트", "rear deltoid": "리어델트", "reverse fly": "리버스플라이", "rear fly": "리어플라이",
    "lateral raise": "래터럴레이즈",
    "hip flexor": "고관절 굴곡근", "hip flexors": "고관절 굴곡근", "lower back": "허리", "upper back": "상부 등",
    "rectus femoris": "대퇴직근", "pectoralis major": "대흉근", "posterior tibialis": "후경골근",
    "hip abduction": "힙어브덕션", "hip adduction": "힙어덕션",
    "external rotation": "외회전", "internal rotation": "내회전",
    "on knees": "무릎 대고", "on knee": "무릎 위", "on floor": "바닥", "on bench": "벤치",
    "with rope attachment": "로프", "rope attachment": "로프", "with towel": "수건", "with rope": "로프",
    "hands against wall": "벽 짚고", "against wall": "벽 짚고",
    "with support": "지지", "full range": "풀레인지", "back pov": "후면", "side pov": "측면",
    "battling ropes": "배틀로프", "jump rope": "줄넘기", "stationary bike": "실내 자전거",
    "elliptical machine": "일립티컬", "stepmill machine": "스텝밀", "skierg machine": "스키에르그",
    "upper body ergometer": "상체 에르고미터", "air bike": "에어바이크",
    "chest dip": "체스트 딥스", "bench dip": "벤치 딥스",
    "side bend": "사이드벤드", "side plank": "사이드플랭크", "side bridge": "사이드브릿지",
    "wall sit": "월싯", "dead bug": "데드버그", "bird dog": "버드독", "bear crawl": "베어크롤",
    "box jump": "박스점프", "burpee": "버피",
}

PHRASES.update({
    "on exercise ball": "짐볼", "on stability ball": "짐볼", "with stability ball": "짐볼", "on bosu ball": "보수볼",
    "on medicine ball": "메디신볼", "on floor": "바닥", "on bench": "벤치", "from bench": "벤치",
    "on incline bench": "인클라인 벤치", "on flat bench": "플랫 벤치", "with v-bar": "V바", "on knees": "무릎 대고",
    "with arm blaster": "암 블래스터", "on dip cage": "딥스 스테이션", "on box": "박스", "on chair": "의자",
    "on step": "스텝", "with strap": "스트랩", "with straps": "스트랩", "on wall": "벽", "with support": "지지",
    "with ez-bar": "EZ바", "with ez bar": "EZ바", "on parallel bars": "평행봉", "on pull-up bar": "풀업바",
    "over a bench": "벤치", "on leg press machine": "레그프레스 머신", "with rope": "로프",
})

WORDS = {
    "dumbbell": "덤벨", "dumbbells": "덤벨", "barbell": "바벨", "cable": "케이블", "lever": "머신", "machine": "머신",
    "band": "밴드", "kettlebell": "케틀벨", "weighted": "중량", "assisted": "어시스트", "roller": "폼롤러",
    "sled": "슬레드", "landmine": "랜드마인", "rope": "로프", "towel": "수건", "suspended": "서스펜션", "ring": "링",
    "bench": "벤치", "box": "박스", "wall": "벽", "floor": "바닥", "chair": "의자", "bar": "바", "tire": "타이어",
    "hammer": "해머", "strap": "스트랩", "straps": "스트랩", "pulley": "풀리", "stirrups": "스터럽",
    "seated": "시티드", "sitted": "시티드", "standing": "스탠딩", "lying": "라잉", "prone": "엎드린", "supine": "누운",
    "kneeling": "닐링", "hanging": "행잉", "incline": "인클라인", "decline": "디클라인", "flat": "플랫",
    "bent": "벤트", "alternate": "얼터네이트", "alternating": "얼터네이트", "unilateral": "한쪽",
    "close": "클로즈", "wide": "와이드", "narrow": "내로우", "reverse": "리버스", "revers": "리버스", "reversed": "리버스",
    "neutral": "뉴트럴", "underhand": "언더핸드", "overhand": "오버핸드", "pronated": "오버그립", "supinated": "언더그립",
    "parallel": "패러렐", "overhead": "오버헤드", "front": "프론트", "rear": "리어", "side": "사이드",
    "lateral": "래터럴", "upright": "업라이트", "high": "하이", "low": "로우", "middle": "미들",
    "inner": "이너", "outer": "아우터", "upper": "상부", "lower": "하부", "full": "풀", "half": "하프", "quarter": "쿼터",
    "deep": "딥", "straight": "스트레이트", "stiff": "스티프", "extended": "익스텐디드", "elevated": "엘리베이티드",
    "single": "싱글", "double": "더블", "one": "원", "two": "투", "three": "3", "both": "양",
    "curl": "컬", "curls": "컬", "press": "프레스", "presses": "프레스", "raise": "레이즈", "raises": "레이즈",
    "row": "로우", "fly": "플라이", "flyes": "플라이", "pullover": "풀오버", "squat": "스쿼트", "squats": "스쿼트",
    "lunge": "런지", "deadlift": "데드리프트", "extension": "익스텐션", "kickback": "킥백", "kickbacks": "킥백",
    "pushdown": "푸시다운", "dip": "딥스", "dips": "딥스", "crunch": "크런치", "crunches": "크런치",
    "plank": "플랭크", "twist": "트위스트", "twists": "트위스트", "twisting": "트위스팅", "twisted": "트위스트",
    "shrug": "슈러그", "stretch": "스트레칭", "jump": "점프", "jumps": "점프", "clean": "클린", "snatch": "스내치",
    "jerk": "저크", "swing": "스윙", "thruster": "스러스터", "carry": "캐리", "march": "마치", "bridge": "브릿지",
    "hyperextension": "하이퍼익스텐션", "rollout": "롤아웃", "rollerout": "롤아웃", "rollerer": "롤아웃",
    "windmill": "윈드밀", "inchworm": "인치웜", "superman": "슈퍼맨", "pull": "풀", "push": "푸시",
    "walk": "워크", "walking": "워킹", "run": "런", "sprint": "스프린트", "hops": "홉", "skater": "스케이터",
    "kick": "킥", "kicks": "킥", "tap": "탭", "touch": "터치", "reach": "리치", "rotation": "로테이션",
    "rotational": "로테이셔널", "circles": "서클", "circular": "서큘러", "slam": "슬램", "throw": "스로", "catch": "캐치",
    "pike": "파이크", "tuck": "턱", "hug": "허그", "hold": "홀드", "isometric": "등척성", "plyo": "플라이오",
    "negative": "네거티브", "speed": "스피드", "power": "파워", "hang": "행", "split": "스플릿", "sumo": "스모",
    "goblet": "고블릿", "hack": "핵", "zercher": "저처", "pistol": "피스톨", "sissy": "시시", "cossack": "코사크",
    "curtsey": "커트시", "donkey": "동키", "frog": "프로그", "spider": "스파이더", "archer": "아처",
    "diamond": "다이아몬드", "clap": "클랩", "drop": "드롭", "depth": "뎁스", "jackknife": "잭나이프",
    "flag": "플래그", "planche": "플란체", "handstand": "물구나무", "burpee": "버피",
    "preacher": "프리처", "concentration": "컨센트레이션", "zottman": "조트맨", "arnold": "아놀드",
    "military": "밀리터리", "french": "프렌치", "jm": "JM", "tate": "테이트", "scott": "스콧", "gironda": "지론다",
    "pendlay": "펜들레이", "romanian": "루마니안", "jefferson": "제퍼슨", "bradford": "브래드포드", "svend": "스벤드",
    "guillotine": "길로틴", "pallof": "팰로프", "russian": "러시안", "cuban": "쿠반", "korean": "코리안",
    "turkish": "터키시", "hindu": "힌두", "judo": "유도", "rocky": "록키", "otis": "오티스", "janda": "얀다",
    "thibaudeau": "티보도", "frankenstein": "프랑켄슈타인", "london": "런던",
    "biceps": "이두", "bicep": "이두", "triceps": "삼두", "tricep": "삼두", "chest": "가슴", "back": "등",
    "shoulder": "어깨", "shoulders": "어깨", "lat": "광배", "lats": "광배", "glute": "둔근", "glutes": "둔근",
    "gluteus": "둔근", "hamstring": "햄스트링", "hamstrings": "햄스트링", "quad": "대퇴사두", "quads": "대퇴사두",
    "calf": "카프", "calves": "종아리", "hip": "힙", "knee": "무릎", "knees": "무릎", "leg": "레그", "legs": "다리",
    "arm": "암", "arms": "팔", "neck": "목", "wrist": "손목", "ankle": "발목", "ankles": "발목", "spine": "척추",
    "toe": "발끝", "heel": "뒤꿈치", "elbow": "팔꿈치", "hand": "손", "hands": "손", "finger": "손가락", "head": "머리",
    "abdominal": "복근", "ab": "복근", "oblique": "옆구리", "groin": "서혜부", "piriformis": "이상근",
    "adductor": "내전근", "abductor": "외전근", "abduction": "어브덕션", "adduction": "어덕션",
    "peroneals": "비골근", "pec": "가슴", "delt": "델트", "deltoid": "델트", "trap": "승모근", "sternum": "흉골",
    "flexor": "굴곡근", "flexion": "굴곡", "pronation": "회내", "supination": "회외",
    "scapula": "견갑", "scapular": "견갑", "pelvic": "골반", "tilt": "틸트",
    "chin": "친", "pose": "자세", "yoga": "요가", "butterfly": "버터플라이", "cat": "캣",
    "v": "V", "t": "T", "y-raise": "Y레이즈", "t-raise": "T레이즈",
    "basic": "기본", "advanced": "고급", "intermediate": "중급", "modified": "변형", "dynamic": "다이나믹",
    "variation": "변형", "style": "스타일", "position": "자세",
    "male": "", "female": "", "on": "", "with": "", "the": "", "of": "", "a": "", "and": "·", "to": "→", "into": "→",
    "in": "", "from": "", "out": "아웃", "up": "업", "down": "다운", "over": "오버", "under": "언더", "through": "스루",
    "around": "어라운드", "forward": "포워드", "backward": "백워드", "across": "크로스", "cross": "크로스",
    "diagonal": "대각선", "vertical": "버티컬", "horizontal": "호리즌탈", "facing": "향해", "apart": "벌려",
    "between": "사이", "above": "위", "behind": "뒤", "off": "", "left": "왼쪽", "right": "오른쪽",
    "grip": "그립", "stance": "스탠스", "range": "레인지", "motion": "모션", "support": "지지", "supported": "지지",
    "attachment": "", "handle": "핸들", "pad": "패드", "platform": "플랫폼", "board": "보드", "rack": "랙",
    "ball": "볼", "bike": "바이크", "treadmill": "트레드밀", "trainer": "트레이너", "ropes": "로프",
    "stepbox": "스텝박스", "step": "스텝", "elliptical": "일립티컬", "stationary": "고정",
    "degrees": "도", "45°": "45도", "45": "45", "2": "2", "3": "3", "4": "4", "8": "8", "180": "180", "360": "360",
}

WORDS.update({
    "blaster": "블래스터", "body": "바디", "lift": "리프트", "lifting": "리프팅", "inverted": "인버티드",
    "inverse": "인버스", "-": "", "wheel": "휠", "squatting": "스쿼팅", "sit": "싯", "raised": "레이즈드",
    "palm": "팜", "world": "월드", "tennis": "테니스", "straddle": "스트래들", "stork": "스톡", "squeeze": "스퀴즈",
    "slingers": "슬링어", "ski": "스키", "self": "셀프", "rocking": "로킹", "retractor": "리트랙터",
    "response": "리스폰스", "potty": "포티", "point": "포인트", "pass": "패스", "maltese": "몰티즈", "jack": "잭",
    "iron": "아이언", "hyper": "하이퍼", "gripless": "그립리스", "flip": "플립", "fixed": "고정", "face": "페이스",
    "depresor": "디프레서", "clasped": "깍지", "balance": "밸런스", "wipers": "와이퍼", "wind": "윈드",
    "waiter": "웨이터", "upward": "업워드", "ups": "업", "twin": "트윈", "swimmer": "스위머", "supper": "서퍼",
    "stride": "스트라이드", "stepmill": "스텝밀", "star": "스타", "stalder": "스탈더", "staircase": "계단",
    "stabilization": "안정화", "squad": "쿼드", "sprints": "스프린트", "sphinx": "스핑크스", "spell": "스펠",
    "slide": "슬라이드", "sledge": "슬레지", "skull": "스컬", "skin": "스킨", "skier": "스키어", "short": "숏",
    "sequence": "시퀀스", "semi": "세미", "seesaw": "시소", "scissor": "시저", "saw": "쏘", "runners": "러너스",
    "round": "라운드", "rotate": "로테이트", "rotary": "로터리", "reps": "반복", "release": "릴리즈",
    "reclining": "리클라이닝", "quick": "퀵", "pyramid": "피라미드", "pro": "프로", "prisoner": "프리즈너",
    "posterior": "후면", "plus": "플러스", "pirate": "파이럿", "pin": "핀", "pike-to-cobra": "파이크→코브라",
    "peacher": "프리처", "outstretched": "뻗은", "outside": "바깥", "multiple": "멀티플", "monster": "몬스터",
    "legged": "레그", "lean": "린", "kipping": "키핑", "keens": "니즈", "kayak": "카약", "inside": "안쪽",
    "impossible": "임파서블", "hyght": "하이트", "hook": "훅", "ground": "그라운드", "gripper": "그리퍼",
    "greatest": "그레이티스트", "gravity": "그래비티", "gorilla": "고릴라", "fours": "네발", "forth": "포스",
    "figure": "피겨", "femoral": "대퇴", "feet": "발", "fallout": "폴아웃", "external": "외", "ergometer": "에르고미터",
    "equipment": "장비", "elevator": "엘리베이터", "drive": "드라이브", "dog": "독", "cycle": "사이클",
    "crawl": "크롤", "crab": "크랩", "contralateral": "반대쪽", "cocoons": "코쿤", "closer": "클로저",
    "clock": "클락", "climb": "클라임", "caster": "캐스터", "captains": "캡틴스", "can": "캔", "cambered": "캠버드",
    "cage": "케이지", "butt-ups": "벗업", "breeding": "브리딩", "boxing": "복싱", "bowling": "볼링",
    "bottoms": "바텀", "bottoms-up": "바텀업", "body-up": "바디업", "big": "빅", "bends": "벤드", "bend": "벤드",
    "benches": "벤치", "astride": "걸터앉아", "anti": "안티", "angle": "앵글", "angled": "앵글", "all": "올",
    "/": "/", ".": "", ",": ",", "&": "·", "+": "+", "dip-pull-up": "딥스-풀업", "elbow-to-knee": "엘보→니",
    "side-to-side": "좌우", "leg-hip": "레그-힙", "up-down": "업다운", "two-one": "투원", "glute-ham": "GHR",
    "chin-up": "친업", "push-up": "푸시업", "sit-up": "싯업", "step-up": "스텝업", "muscle-up": "머슬업",
    "bent-over": "벤트오버", "close-grip": "클로즈그립", "wide-grip": "와이드그립", "reverse-grip": "리버스그립",
    "ez-bar": "EZ바", "t-bar": "T바", "v-bar": "V바", "w-press": "W프레스", "l-sit": "L싯",
})

PHRASES.update({
    "lateral pulldown": "랫풀다운", "knee raise": "니레이즈", "knees raise": "니레이즈", "throw down": "스로다운",
    "prone lying": "엎드려", "pull through": "풀스루", "low row": "하단 로우", "low seated row": "하단 시티드 로우",
    "bent arm": "벤트암", "full squat": "풀스쿼트", "high bar": "하이바", "low bar": "로우바",
    "shoulder raise": "숄더레이즈", "shoulder tap": "숄더탭", "rack pull": "랙풀", "pin presses": "핀프레스",
    "stiff leg": "스티프레그", "knees bent": "무릎 굽힘", "bent knee": "무릎 굽힘", "bent knees": "무릎 굽힘",
    "inverse leg curl": "노르딕컬", "revers fly": "리버스플라이", "high pulley": "하이풀리",
    "full range of motion": "풀레인지", "chest fly": "체스트플라이", "clean and press": "클린 앤 프레스",
    "clean and jerk": "클린 앤 저크", "3/4": "3/4", "jump squat": "점프스쿼트", "split jerk": "스플릿저크",
    "hang clean": "행클린", "power clean": "파워클린", "power snatch": "파워스내치", "hang snatch": "행스내치",
    "lunge with twist": "런지 트위스트", "walking lunge": "워킹런지", "reverse lunge": "리버스런지",
    "lateral lunge": "래터럴런지", "side lunge": "사이드런지", "rear lunge": "리어런지", "jump lunge": "점프런지",
    "seated row": "시티드로우", "bent over row": "벤트오버로우", "incline bench": "인클라인 벤치",
    "decline bench": "디클라인 벤치", "flat bench": "플랫 벤치", "preacher bench": "프리처 벤치",
    "triceps dips": "트라이셉스 딥스", "chest dips": "체스트 딥스", "bench dips": "벤치 딥스",
    "hammer curls": "해머컬", "reverse wrist curl": "리버스 리스트컬", "revers wrist curl": "리버스 리스트컬",
    "neck side stretch": "목 옆 스트레칭", "side push neck stretch": "손으로 당기는 목 옆 스트레칭",
    "jumping jacks": "점핑잭", "star jump": "스타점프", "high knee": "하이니", "high knees": "하이니",
    "butt kicks": "벗킥", "lying leg curl": "라잉 레그컬", "seated leg curl": "시티드 레그컬",
    "leg curls": "레그컬", "kettlebell swing": "케틀벨 스윙", "goblet": "고블릿",
    "front plank": "프론트플랭크", "plank jack": "플랭크잭", "plank": "플랭크",
})
PHRASES.update({
    "side lying": "사이드라잉", "cross body": "크로스바디", "upper chest": "윗가슴", "calf stretch": "종아리 스트레칭",
    "back wrist curl": "비하인드백 리스트컬", "back shrug": "비하인드백 슈러그", "straight back": "등 곧게",
    "lat bar": "랫바", "t bar": "T바", "revers grip": "리버스그립", "palm in": "뉴트럴그립", "palms in": "뉴트럴그립",
    "external shoulder rotation": "어깨 외회전", "lying supine": "누운", "lying on floor": "바닥 라잉",
    "finger curls": "핑거컬", "full can": "풀캔", "stork stance": "한발서기", "bent arms": "벤트암", "step up": "스텝업",
    "curl and press": "컬 앤 프레스", "arms straight": "팔 펴고", "shoulder raises": "숄더레이즈", "one hand": "원암",
    "around world": "어라운드 더 월드", "elbow to knee": "엘보 투 니", "elbow-to-knee": "엘보 투 니",
    "oblique crunch": "오블리크 크런치", "oblique crunches": "오블리크 크런치", "upper row": "어퍼 로우",
    "captains chair": "캡틴스체어", "cambered bar": "캠버드바", "chest pass": "체스트 패스", "chest push": "체스트 푸시",
    "chest throw": "체스트 스로", "chest tap": "체스트탭", "body saw": "바디쏘", "toe raise": "토레이즈",
    "leg kick": "레그킥", "tap shoulder": "숄더탭", "shoulder grip": "어깨너비 그립", "twin handle": "트윈핸들",
    "high pull": "하이풀", "pass through": "패스스루", "figure 8": "피겨8", "skin the cat": "스킨 더 캣",
    "rear pull-up": "비하인드넥 풀업", "wrist circles": "손목 돌리기", "ankle circles": "발목 돌리기",
})
PHRASE_KEYS = sorted(PHRASES, key=len, reverse=True)
WORDS["oblique"] = "오블리크"

TRAIL = re.compile(
    r"\s+((?:on|with|from|over a|using|holding) (?:an? )?(?:exercise ball|stability ball|bosu ball|medicine ball|"
    r"floor|bench|incline bench|flat bench|v-bar|rope attachment|rope|towel|knees|dip-pull-up cage|box|chair|step|"
    r"arm blaster|strap|straps|wall|support|ez-bar|ez bar|parallel bars|pull-up bar|leg press machine|"
    r"straight bar|stepbox support|hands against wall|exercise ball|stability ball))$"
)
PHRASES.update({"on straight bar": "스트레이트바", "with stepbox support": "스텝박스 지지",
                "with hands against wall": "벽 짚고", "over exercise ball": "짐볼"})
PHRASE_KEYS = sorted(PHRASES, key=len, reverse=True)

def normalize(name: str) -> str:
    n = name.lower().replace("45в°", "45°").replace("_", " ")
    n = n.replace("dip-pull-up cage", "dip cage")
    n = re.sub(r"\s+", " ", n).strip()
    n = re.sub(r"\s*-\s*\(", " (", n)  # "raise - (band...)"
    n = re.sub(r"\s+-\s+([a-z ]+)$", r" (\1)", n)  # "calf raise - hammer grip"
    if " over bench " in n:
        n = n.replace(" over bench ", " ") + " (over a bench)"
    m = TRAIL.search(n)
    if m and not n.startswith(m.group(1)):
        n = n[: m.start()] + f" ({m.group(1)})"
    return n

PHRASE_KEYS = sorted(PHRASES, key=len, reverse=True)

def translate_segment(seg: str) -> str:
    seg = seg.strip(" ,")
    # v. 2 / v.2 표기
    seg = re.sub(r"\bv\. ?(\d)", r"__V\1__", seg)
    out = seg
    for key in PHRASE_KEYS:
        out = re.sub(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", f" {{{PHRASES[key]}}} ", out)
    tokens = re.findall(r"\{[^}]*\}|__V\d__|[a-z0-9°'][a-z0-9°'\-]*|[^\sa-z0-9]", out)
    res = []
    for t in tokens:
        if t.startswith("{"):
            res.append(t[1:-1])
        elif t.startswith("__V"):
            res.append(f"v{t[3]}")
        elif t in WORDS:
            res.append(WORDS[t])
        elif "-" in t and all(p in WORDS for p in t.split("-")):
            res.append("".join(WORDS[p] for p in t.split("-")))
        else:
            res.append(f"«{t}»")  # 미번역 표시
    s = " ".join(x for x in res if x)
    s = re.sub(r"\s+", " ", s).strip()
    s = s.replace(" · ", "·").replace("→ ", "→").replace(" →", "→").replace(" ,", ",")
    s = s.replace("벤치 프레스", "벤치프레스").replace("3 / 4", "3/4")
    return s

def translate(name: str) -> str:
    n = normalize(name)
    parens = re.findall(r"\(([^)]*)\)", n)
    main = re.sub(r"\([^)]*\)", " ", n)
    out = translate_segment(main)
    extras = [translate_segment(p) for p in parens]
    extras = [e for e in extras if e]
    if extras:
        out += " (" + ", ".join(extras) + ")"
    return out

if __name__ == "__main__":
    data = json.load(open(sys.argv[1]))["exercises"]
    for x in data:
        print(f"{x['id']}\t{x['name_en']}\t{translate(x['name_en'])}")
