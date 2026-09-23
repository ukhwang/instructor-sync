"use client";

import { useState } from "react";
import type { ExerciseMedia as ExerciseMediaData } from "@/lib/exercise-media";

interface ExerciseMediaProps {
  media: ExerciseMediaData;
  description: string;
}

export function ExerciseMedia({ media, description }: ExerciseMediaProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [animatedFailed, setAnimatedFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  if (media.video && !videoFailed) {
    return (
      <video
        className="aspect-video w-full border border-black bg-neutral-100 object-contain"
        controls
        muted
        playsInline
        preload="metadata"
        poster={media.poster}
        aria-label={media.alt}
        onError={() => setVideoFailed(true)}
      >
        <source src={media.video} type="video/mp4" />
      </video>
    );
  }

  if (media.animatedFallback && !animatedFailed) {
    return (
      // A plain img supports both animated WebP and GIF without image optimization changing frames.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={media.animatedFallback}
        alt={media.alt}
        className="aspect-video w-full border border-black bg-neutral-100 object-contain"
        onError={() => setAnimatedFailed(true)}
      />
    );
  }

  if (media.poster && !posterFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={media.poster}
        alt={media.alt}
        className="aspect-video w-full border border-black bg-neutral-100 object-contain"
        onError={() => setPosterFailed(true)}
      />
    );
  }

  return (
    <p className="border border-neutral-300 bg-neutral-50 p-3 text-sm font-medium leading-relaxed text-neutral-800">
      {description}
    </p>
  );
}
