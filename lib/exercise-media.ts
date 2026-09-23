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

const MEDIA_BY_EXERCISE: Record<string, ExerciseMedia> = {
  "글루트 브릿지": {
    poster: "/exercise-media/glute-bridge.svg",
    alt: "글루트 브릿지 시작 자세와 엉덩이를 들어 올린 자세 안내",
  },
  "Glute Bridge": {
    poster: "/exercise-media/glute-bridge.svg",
    alt: "Glute bridge setup and raised position guide",
  },
};

export function getExerciseMedia(name: string): ExerciseMedia | null {
  return MEDIA_BY_EXERCISE[name.trim()] ?? null;
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
