import { Metadata } from "next";
import { openHomeworkRpc } from "@/lib/db-server";
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
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  const token = resolvedParams.token;

  const result = await openHomeworkRpc(token);

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

  const items: HomeworkItem[] = (result.items || []).map((it, idx) => {
    const media = getHomeworkExerciseMedia(it) || getExerciseMedia(it.name);
    const mediaUrl = it.media_url || media?.video || media?.animatedFallback || media?.poster || null;
    const mediaType: "video" | "gif" | "image" | null =
      (it.media_type as "video" | "gif" | "image" | null) ||
      (media?.video ? "video" : (media?.animatedFallback ? "gif" : (media?.poster ? "image" : null)));
    const posterUrl = media?.poster || null;

    return {
      id: it.id || `item-${idx + 1}`,
      homeworkId: result.homework!.id,
      order: it.order_index ?? idx + 1,
      exerciseName: it.name,
      sets: it.target_sets ?? 3,
      reps: parseInt(it.target_reps || "10", 10) || 10,
      durationSec: null,
      restSec: it.rest_seconds ?? 30,
      cue: it.cue || getHomeworkExerciseDescription(it) || "정확한 자세와 호흡에 집중하세요",
      mediaUrl,
      mediaType,
      posterUrl,
    };
  });

  const homeworkData: Homework = {
    id: result.homework!.id,
    memberId: result.member?.id || "demo-member",
    title: `${result.member?.name || "회원"} 님의 맞춤 운동숙제`,
    why: result.homework!.why || "오늘 수업의 효과를 극대화하기 위한 숙제입니다.",
    token: result.homework!.token || token,
    status: (result.homework!.status as any) || "assigned",
    items,
    assignedAt: result.homework!.created_at,
    dueAt: result.homework!.token_expires_at,
    member: {
      id: result.member?.id || "demo-member",
      name: result.member?.name || "회원",
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
            name: result.member?.name || "회원",
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
