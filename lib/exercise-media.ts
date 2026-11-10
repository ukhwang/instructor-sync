export interface ExerciseMedia {
  video?: string;
  animatedFallback?: string;
  poster?: string;
  alt: string;
}

type HomeworkMediaSource = {
  name: string;
  cue?: string | null;
  exercise_snapshot?: {
    name?: string;
    media_url?: string | null;
    media_alt?: string | null;
    default_cue?: string | null;
  } | null;
};

// GitHub 퍼블릭 도메인(CC0) 오픈소스 운동 DB 기반 CDN 베이스 URL
// 1. hasaneyldrm/exercises-dataset: 1,324개 고품질 180p 무한 루프 애니메이션 GIF
const GITHUB_GIF_CDN_BASE = "https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos";
const GITHUB_IMAGE_CDN_BASE = "https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images";
// 2. yuhonas/free-exercise-db: 876개 고화질 포스터 사진
const GITHUB_FREE_EXERCISE_DB_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

const MEDIA_BY_EXERCISE: Record<string, ExerciseMedia> = {
  // 기존 로컬 시드 호환성 유지
  "글루트 브릿지": {
    poster: "/exercise-media/glute-bridge.svg",
    alt: "글루트 브릿지 시작 자세와 엉덩이를 들어 올린 자세 안내",
  },
  "Glute Bridge": {
    poster: "/exercise-media/glute-bridge.svg",
    alt: "Glute bridge setup and raised position guide",
  },

  // 1. 척추·골반 5분 루틴
  "버드독 (Bird Dog)": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/3239-h1ezqSu.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/All_Fours_Quad_Stretch/0.jpg`,
    alt: "버드독 척추 골반 교차 안정화 동작 안내",
  },
  "글루트 브릿지 (Glute Bridge)": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/3013-u0cNiij.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/Barbell_Glute_Bridge/0.jpg`,
    alt: "글루트 브릿지 둔근 수축 및 골반 수평 유지 동작 안내",
  },
  "데드버그 (Dead Bug)": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/0276-iny3m5y.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/Dead_Bug/0.jpg`,
    alt: "데드버그 복부 긴장 및 팔다리 교차 이완 동작 안내",
  },

  // 2. 라운드숄더 3분 루틴
  "엎드려 Y-레이즈 (Prone Y-Raise)": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/3541-PbzNu7c.gif`,
    alt: "엎드려 Y-레이즈 등 하부 승모근 수축 동작 안내",
  },
  "월 슬라이드 (Wall Slide)": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/0659-LEH9jxP.gif`,
    poster: `${GITHUB_IMAGE_CDN_BASE}/0659-LEH9jxP.jpg`,
    alt: "월 슬라이드 벽 밀착 어깨 가동성 동작 안내",
  },

  // 3. 고관절 가동성 4분 루틴
  "90-90 고관절 회전 스트레칭": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/1710-RQNVT10.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/90_90_Hamstring/0.jpg`,
    alt: "90-90 고관절 안팎 회전 가동성 스트레칭 안내",
  },
  "런지 힙 플렉서 스트레칭": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/1564-tFGKm99.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/Bodyweight_Walking_Lunge/0.jpg`,
    alt: "런지 힙 플렉서 골반 앞쪽 장요근 이완 스트레칭 안내",
  },

  // 4. 전신 기본 동작
  "스쿼트 (Squat)": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/3132-b63ZzGe.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/Barbell_Full_Squat/0.jpg`,
    alt: "스쿼트 무릎과 둔근 정렬 동작 안내",
  },
  "스쿼트": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/3132-b63ZzGe.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/Barbell_Full_Squat/0.jpg`,
    alt: "스쿼트 무릎과 둔근 정렬 동작 안내",
  },
  "플랭크 (Plank)": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/0464-CosupLu.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/Plank/0.jpg`,
    alt: "플랭크 코어 정렬 및 복부 긴장 동작 안내",
  },
  "플랭크": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/0464-CosupLu.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/Plank/0.jpg`,
    alt: "플랭크 코어 정렬 및 복부 긴장 동작 안내",
  },
  "런지 (Lunge)": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/3470-kMzUs9Y.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/Bodyweight_Walking_Lunge/0.jpg`,
    alt: "런지 하체 균형 및 고관절 굴곡 동작 안내",
  },
  "런지": {
    animatedFallback: `${GITHUB_GIF_CDN_BASE}/3470-kMzUs9Y.gif`,
    poster: `${GITHUB_FREE_EXERCISE_DB_BASE}/Bodyweight_Walking_Lunge/0.jpg`,
    alt: "런지 하체 균형 및 고관절 굴곡 동작 안내",
  },
};

/**
 * 운동명으로 등록된 GitHub 오픈소스 가이드 미디어 검색
 * 1. 정확한 매칭 우선
 * 2. 공백 제거 및 키워드 기반 스마트 매칭
 */
export function getExerciseMedia(name: string): ExerciseMedia | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  if (MEDIA_BY_EXERCISE[trimmed]) {
    return MEDIA_BY_EXERCISE[trimmed];
  }

  const normalized = trimmed.toLowerCase().replace(/[\s\-_()]/g, "");

  if (normalized.includes("데드버그") || normalized.includes("deadbug")) {
    return MEDIA_BY_EXERCISE["데드버그 (Dead Bug)"];
  }
  if (normalized.includes("버드독") || normalized.includes("birddog")) {
    return MEDIA_BY_EXERCISE["버드독 (Bird Dog)"];
  }
  if (normalized.includes("브릿지") || normalized.includes("bridge")) {
    return MEDIA_BY_EXERCISE["글루트 브릿지 (Glute Bridge)"];
  }
  if (normalized.includes("y레이즈") || normalized.includes("yraise")) {
    return MEDIA_BY_EXERCISE["엎드려 Y-레이즈 (Prone Y-Raise)"];
  }
  if (normalized.includes("월슬라이드") || normalized.includes("wallslide")) {
    return MEDIA_BY_EXERCISE["월 슬라이드 (Wall Slide)"];
  }
  if (normalized.includes("9090") || normalized.includes("고관절회전")) {
    return MEDIA_BY_EXERCISE["90-90 고관절 회전 스트레칭"];
  }
  if (normalized.includes("장요근") || normalized.includes("힙플렉서") || normalized.includes("hipflexor")) {
    return MEDIA_BY_EXERCISE["런지 힙 플렉서 스트레칭"];
  }
  if (normalized.includes("스쿼트") || normalized.includes("squat")) {
    return MEDIA_BY_EXERCISE["스쿼트 (Squat)"];
  }
  if (normalized.includes("플랭크") || normalized.includes("plank")) {
    return MEDIA_BY_EXERCISE["플랭크 (Plank)"];
  }
  if (normalized.includes("런지") || normalized.includes("lunge")) {
    return MEDIA_BY_EXERCISE["런지 (Lunge)"];
  }

  return null;
}

export function getHomeworkExerciseMedia(item: HomeworkMediaSource): ExerciseMedia | null {
  const snapshot = item.exercise_snapshot;
  if (snapshot?.media_url) {
    return {
      poster: snapshot.media_url,
      alt: snapshot.media_alt?.trim() || `${snapshot.name || item.name} 동작 안내`,
    };
  }
  return getExerciseMedia(item.name);
}

export function getHomeworkExerciseDescription(item: HomeworkMediaSource): string {
  return item.cue?.trim()
    || item.exercise_snapshot?.default_cue?.trim()
    || `${item.name} 동작을 천천히 따라 해주세요.`;
}

export function exerciseMediaSources(media: ExerciseMedia): string[] {
  return [media.video, media.animatedFallback, media.poster].filter(
    (source): source is string => Boolean(source)
  );
}
