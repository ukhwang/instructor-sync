import { Metadata } from "next";
import { isPublicDemoToken, openHomeworkRpc } from "@/lib/db-server";
import { MemberHomeworkContainer } from "./MemberHomeworkContainer";
import type { Homework, HomeworkItem } from "@/lib/types";
import { COPY } from "@/lib/copy";
import {
  getHomeworkExerciseMedia,
  getExerciseMedia,
  getHomeworkExerciseDescription,
} from "@/lib/exercise-media";

export const metadata: Metadata = {
  title: "운동숙제 — 회원 기록",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function MemberHomeworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ name?: string | string[] }>;
}) {
  const resolvedParams = await params;
  const token = resolvedParams.token;
  const query = await searchParams;

  // 공개 데모 토큰(정확히 일치)은 openHomeworkRpc 가 DB 없이 샘플을 돌려준다.
  // 그 외 토큰은 DB 판정(만료·회수 포함)만 신뢰한다.
  const result = await openHomeworkRpc(token);

  // 체험 모드에서 숙제를 낸 회원 이름을 이어 준다. 데모 토큰에서만, 표시 이름만 바꾼다.
  const requestedName = typeof query.name === "string" ? query.name.trim() : "";
  const demoName = isPublicDemoToken(token) && /^[가-힣A-Za-z]{1,10}$/.test(requestedName) ? requestedName : null;

  if (!result.success) {
    let title: string = COPY.MEMBER.NOT_FOUND_TITLE;
    let desc: string = COPY.MEMBER.NOT_FOUND_DESC;

    if (result.reason === "revoked") {
      title = COPY.MEMBER.REVOKED_TITLE;
      desc = COPY.MEMBER.REVOKED_DESC;
    } else if (result.reason === "expired") {
      title = COPY.MEMBER.EXPIRED_TITLE;
      desc = COPY.MEMBER.EXPIRED_DESC;
    } else if (result.reason === "unavailable") {
      title = "잠시 연결이 원활하지 않습니다";
      desc = "기록은 아직 제출되지 않았습니다. 잠시 후 이 링크를 다시 열어주세요.";
    }

    return (
      <div className="min-h-screen bg-[#f7f7f5] text-[#111111] flex flex-col justify-center items-center p-4">
        <div className="brutalist-box max-w-md w-full p-6 md:p-8 bg-white text-center space-y-4">
          <div className="font-mono text-xs font-black bg-black text-white px-2 py-0.5 inline-block">
            {COPY.BRAND_NAME}
          </div>
          <h1 className="text-2xl font-black text-black">{title}</h1>
          <p className="text-sm font-bold text-neutral-700">{desc}</p>
        </div>
      </div>
    );
  }

  // 데모 토큰에서 받은 이름이 있으면 그것을, 아니면 DB가 준 이름을 쓴다 (표시 전용).
  const displayName = demoName ?? result.member?.name ?? "회원";

  const items: HomeworkItem[] = (result.items || []).map((it, idx) => {
    const name = it.name ?? "운동";
    const source = { name, cue: it.cue ?? null, exercise_snapshot: it.exercise_snapshot ?? null };
    const media = getHomeworkExerciseMedia(source) || getExerciseMedia(name);
    // GIF 는 <img> 로 재생되므로 "image" 로 분류한다.
    const mediaUrl = media?.video || media?.animatedFallback || media?.poster || null;
    const mediaType: HomeworkItem["mediaType"] = media?.video ? "video" : mediaUrl ? "image" : null;

    return {
      id: it.id || `item-${idx + 1}`,
      homeworkId: result.homework!.id,
      order: it.order_index ?? idx + 1,
      exerciseName: name,
      sets: it.target_sets ?? 3,
      reps: Number.parseInt(it.target_reps || "10", 10) || 10,
      durationSec: null,
      restSec: it.rest_seconds ?? 30,
      cue: it.cue || getHomeworkExerciseDescription(source) || "정확한 자세와 호흡에 집중하세요",
      mediaUrl,
      mediaType,
      posterUrl: media?.poster || null,
    };
  });

  const homeworkData: Homework = {
    id: result.homework!.id,
    memberId: result.member?.id || "demo-member",
    title: `${displayName} 님의 맞춤 운동숙제`,
    why: result.homework!.why || "오늘 수업의 효과를 극대화하기 위한 숙제입니다.",
    token: result.homework!.token || token,
    status: result.homework!.status || "sent",
    items,
    assignedAt: result.homework!.created_at,
    dueAt: result.homework!.token_expires_at,
    member: {
      id: result.member?.id || "demo-member",
      name: displayName,
      phoneLast4: "0000",
      ptSessionCount: 1,
      nextSessionAt: null,
      avatarUrl: null,
    },
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col justify-between py-6 px-4">
      <div className="max-w-xl w-full mx-auto space-y-6">
        <MemberHomeworkContainer
          homework={homeworkData}
          member={{
            id: result.member?.id || "demo-member",
            name: displayName,
          }}
        />
      </div>

      <footer className="max-w-xl w-full mx-auto pt-8 text-center">
        <p className="text-xs font-mono text-slate-400">
          운동숙제 — 기록은 수업으로 이어집니다
        </p>
      </footer>
    </div>
  );
}
