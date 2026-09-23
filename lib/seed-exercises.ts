import { inferCoachFromRepsLabel } from './coach';
import { SeedExercise } from './types';

const SEED_BASE: Array<Omit<
  SeedExercise,
  | 'default_effort_kind'
  | 'default_rep_count'
  | 'default_hold_seconds'
  | 'default_seconds_per_rep'
  | 'default_rest_seconds'
  | 'default_per_side'
>> = [
  // 1. 고관절 / 둔근 (Hip / Glute)
  {
    category: '고관절/둔근',
    name: '글루트 브릿지',
    default_cue: '골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다.',
    default_sets: 3,
    default_reps: '15회',
  },
  {
    category: '고관절/둔근',
    name: '사이드 라잉 클램쉘',
    default_cue: '골반이 뒤로 넘어가지 않게 고정하고 무릎을 벌립니다.',
    default_sets: 3,
    default_reps: '15회 (각)',
  },
  {
    category: '고관절/둔근',
    name: '힙 힌지 드릴 (벽 터치)',
    default_cue: '무릎은 살짝만 굽히고 엉덩이를 뒤쪽 벽으로 밀어냅니다.',
    default_sets: 3,
    default_reps: '12회',
  },
  {
    category: '고관절/둔근',
    name: '버드독 (Bird-Dog)',
    default_cue: '허리가 꺾이지 않도록 복압을 잡고 반대 손발을 뻗습니다.',
    default_sets: 3,
    default_reps: '10회 (각)',
  },
  {
    category: '고관절/둔근',
    name: '싱글 레그 데드리프트 (맨몸)',
    default_cue: '지지하는 발바닥 전체로 바닥을 누르며 균형을 잡습니다.',
    default_sets: 3,
    default_reps: '10회 (각)',
  },
  {
    category: '고관절/둔근',
    name: '런지 & 힙 플렉서 스트레칭',
    default_cue: '골반을 앞으로 밀어 장요근이 길어지는 느낌을 유지합니다.',
    default_sets: 3,
    default_reps: '30초 (각)',
  },
  {
    category: '고관절/둔근',
    name: '90-90 고관절 회전 스트레칭',
    default_cue: '상체를 세우고 양 무릎을 바닥에 지그시 눌러줍니다.',
    default_sets: 3,
    default_reps: '10회 (각)',
  },
  {
    category: '고관절/둔근',
    name: '개구리 자세 고관절 모빌리티',
    default_cue: '무릎을 넓게 벌리고 엉덩이를 뒤로 앉히며 안쪽 허벅지를 늘립니다.',
    default_sets: 3,
    default_reps: '10회',
  },

  // 2. 흉추 / 어깨 가동성 (Thoracic / Shoulder)
  {
    category: '흉추/어깨',
    name: '흉추 회전 (오픈 북)',
    default_cue: '골반은 고정하고 갈비뼈와 시선이 함께 회전합니다.',
    default_sets: 3,
    default_reps: '10회 (각)',
  },
  {
    category: '흉추/어깨',
    name: '고양이-소 자세 (캣 카우)',
    default_cue: '척추 마디마디를 하나씩 움직인다는 느낌으로 분절합니다.',
    default_sets: 3,
    default_reps: '10회',
  },
  {
    category: '흉추/어깨',
    name: '월 슬라이드 (Wall Slide)',
    default_cue: '팔꿈치와 손등이 벽에서 떨어지지 않게 천천히 올립니다.',
    default_sets: 3,
    default_reps: '12회',
  },
  {
    category: '흉추/어깨',
    name: '흉추 폼롤러 신전',
    default_cue: '폼롤러를 등 뒤에 대고 숨을 내쉬며 가슴을 열어줍니다.',
    default_sets: 3,
    default_reps: '10회',
  },
  {
    category: '흉추/어깨',
    name: '프론 Y-T-W 레이즈',
    default_cue: '승모근 대신 날개뼈 안쪽과 하부 승모근에 힘을 줍니다.',
    default_sets: 3,
    default_reps: '10회',
  },
  {
    category: '흉추/어깨',
    name: '스레드 더 니들 (Thread the needle)',
    default_cue: '한쪽 팔을 반대 겨드랑이 밑으로 깊숙이 밀어 넣습니다.',
    default_sets: 3,
    default_reps: '10회 (각)',
  },
  {
    category: '흉추/어깨',
    name: '숄더 디스로케이션 (밴드/수건)',
    default_cue: '팔꿈치를 펴고 어깨 가동범위 내에서 부드럽게 넘깁니다.',
    default_sets: 3,
    default_reps: '12회',
  },
  {
    category: '흉추/어깨',
    name: '소원근/후면 삼각근 릴리즈 (볼)',
    default_cue: '마사지볼을 겨드랑이 뒤쪽에 대고 좌우로 굴립니다.',
    default_sets: 3,
    default_reps: '40초 (각)',
  },

  // 3. 코어 / 척추 안정성 (Core / Spine)
  {
    category: '코어/척추',
    name: '데드버그 (Deadbug)',
    default_cue: '허리가 바닥에서 뜨지 않도록 아랫배를 바닥으로 누릅니다.',
    default_sets: 3,
    default_reps: '12회 (각)',
  },
  {
    category: '코어/척추',
    name: '플랭크 (기본)',
    default_cue: '엉덩이가 들리거나 허리가 꺾이지 않게 일직선을 유지합니다.',
    default_sets: 3,
    default_reps: '30초',
  },
  {
    category: '코어/척추',
    name: '사이드 플랭크',
    default_cue: '아래쪽 옆구리를 들어 올려 어깨와 골반이 평행하게 유지합니다.',
    default_sets: 3,
    default_reps: '20초 (각)',
  },
  {
    category: '코어/척추',
    name: '맥길 빅3 컬업 (Curl-Up)',
    default_cue: '목만 당기지 말고 갈비뼈를 골반 쪽으로 살짝 조입니다.',
    default_sets: 3,
    default_reps: '8회 (5초 유지)',
  },
  {
    category: '코어/척추',
    name: '베어 홀드 (Bear Hold)',
    default_cue: '무릎을 바닥에서 3cm만 띄우고 중립 척추를 유지합니다.',
    default_sets: 3,
    default_reps: '25초',
  },
  {
    category: '코어/척추',
    name: '팔로프 프레스 (밴드/수건)',
    default_cue: '몸통이 돌아가지 않게 코어로 저항하며 앞으로 뻗습니다.',
    default_sets: 3,
    default_reps: '10회 (각)',
  },
  {
    category: '코어/척추',
    name: '할로우 바디 홀드',
    default_cue: '허리를 바닥에 완전히 밀착시키고 팔다리를 뻗습니다.',
    default_sets: 3,
    default_reps: '20초',
  },
  {
    category: '코어/척추',
    name: '복식 호흡 & 복압 훈련 (90/90)',
    default_cue: '숨을 들이마실 때 갈비뼈와 배 전체가 360도로 팽창합니다.',
    default_sets: 3,
    default_reps: '10회 호흡',
  },

  // 4. 발목 / 종아리 / 하체 (Ankle / Lower Body)
  {
    category: '발목/하체',
    name: '벽 발목 배측굴곡 모빌리티',
    default_cue: '뒤꿈치가 바닥에서 뜨지 않은 채 무릎을 벽으로 터치합니다.',
    default_sets: 3,
    default_reps: '12회 (각)',
  },
  {
    category: '발목/하체',
    name: '카프 레이즈 (비복근/가자미근)',
    default_cue: '엄지발가락 쪽으로 체중을 실어 뒤꿈치를 높이 들어 올립니다.',
    default_sets: 3,
    default_reps: '15회',
  },
  {
    category: '발목/하체',
    name: '단족 운동 (Short Foot / 아치 활성화)',
    default_cue: '발가락을 구부리지 않고 발바닥 아치를 위로 당겨 올립니다.',
    default_sets: 3,
    default_reps: '10회 (5초 유지)',
  },
  {
    category: '발목/하체',
    name: '대퇴사두근 스트레칭 (카우치 스트레칭)',
    default_cue: '벽에 정강이를 대고 상체를 세워 앞벅지를 강하게 늘립니다.',
    default_sets: 3,
    default_reps: '30초 (각)',
  },
  {
    category: '발목/하체',
    name: '햄스트링 액티브 스트레칭',
    default_cue: '누워서 허벅지 뒤를 잡고 무릎을 천천히 펴줍니다.',
    default_sets: 3,
    default_reps: '10회 (각)',
  },
  {
    category: '발목/하체',
    name: '사이드 런지 (내전근 가동성)',
    default_cue: '가슴을 펴고 한쪽 엉덩이를 뒤로 앉히며 안쪽 허벅지를 늘립니다.',
    default_sets: 3,
    default_reps: '10회 (각)',
  },
  {
    category: '발목/하체',
    name: '종아리 폼롤러 릴리즈',
    default_cue: '종아리 아래에 롤러를 두고 발목을 돌리며 뭉친 곳을 풉니다.',
    default_sets: 3,
    default_reps: '40초 (각)',
  },
  {
    category: '발목/하체',
    name: '발목 외번 밴드 운동',
    default_cue: '발목을 바깥쪽으로 당기며 비골근을 활성화합니다.',
    default_sets: 3,
    default_reps: '15회 (각)',
  },

  // 5. 목 / 상체 자세 교정 (Neck / Upper Body)
  {
    category: '목/상체',
    name: '친 턱 (Chin Tuck / 거북목 교정)',
    default_cue: '턱을 아래로 당겨 뒤통수가 길어지는 느낌을 만듭니다.',
    default_sets: 3,
    default_reps: '10회 (5초 유지)',
  },
  {
    category: '목/상체',
    name: '흉쇄유돌근 & 사각근 릴리즈',
    default_cue: '고개를 반대로 돌리고 목 옆 근육을 손가락으로 가볍게 풉니다.',
    default_sets: 3,
    default_reps: '30초 (각)',
  },
  {
    category: '목/상체',
    name: '소흉근 벽 스트레칭',
    default_cue: '팔꿈치를 벽에 대고 상체를 앞으로 돌려 가슴 앞쪽을 늘립니다.',
    default_sets: 3,
    default_reps: '30초 (각)',
  },
  {
    category: '목/상체',
    name: '견갑골 푸쉬업 (Scapular Push-Up)',
    default_cue: '팔꿈치는 펴둔 채 날개뼈만 모았다가 밀어냅니다.',
    default_sets: 3,
    default_reps: '12회',
  },
  {
    category: '목/상체',
    name: '코브라 자세 (상부 흉추 신전)',
    default_cue: '어깨를 내리고 쇄골을 양옆으로 펼치며 가슴을 듭니다.',
    default_sets: 3,
    default_reps: '10회 (3초 유지)',
  },
  {
    category: '목/상체',
    name: '광배근 스트레칭 (기둥 잡기)',
    default_cue: '기둥을 잡고 엉덩이를 뒤로 빼며 겨드랑이 아래를 늘립니다.',
    default_sets: 3,
    default_reps: '30초 (각)',
  },
  {
    category: '목/상체',
    name: '상부 승모근 스트레칭',
    default_cue: '손으로 머리를 부드럽게 옆으로 당겨 목 옆선을 늘립니다.',
    default_sets: 3,
    default_reps: '20초 (각)',
  },
  {
    category: '목/상체',
    name: '프론 암 리프트 (등 상부 활성화)',
    default_cue: '엎드려서 엄지손가락을 하늘로 향하게 하고 팔을 들어 올립니다.',
    default_sets: 3,
    default_reps: '12회',
  },
];

export const SEED_EXERCISES: SeedExercise[] = SEED_BASE.map((seed) => {
  const coach = inferCoachFromRepsLabel(seed.default_reps);
  return {
    ...seed,
    default_effort_kind: coach.default_effort_kind,
    default_rep_count: coach.default_reps,
    default_hold_seconds: coach.default_hold_seconds,
    default_seconds_per_rep: coach.default_seconds_per_rep,
    default_rest_seconds: coach.default_rest_seconds,
    default_per_side: coach.default_per_side,
  };
});
