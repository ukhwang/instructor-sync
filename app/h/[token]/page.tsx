import { Metadata } from "next";
import { openHomeworkRpc } from "@/lib/db-server";
import { MemberHomeworkClient } from "./MemberHomeworkClient";
import { COPY } from "@/lib/copy";

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

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#111111] flex flex-col justify-between py-6 px-4">
      <div className="max-w-xl w-full mx-auto space-y-6">
        {/* Top Header */}
        <header className="flex items-center justify-between pb-3 border-b-2 border-black">
          <div className="flex items-center gap-2">
            <span className="bg-black text-white text-sm font-black px-2 py-0.5 font-mono">
              {COPY.BRAND_NAME}
            </span>
            <span className="font-bold text-sm">
              {result.member?.name || "회원"}{COPY.MEMBER.TITLE_SUFFIX}
            </span>
          </div>
          <span className="text-[11px] font-mono text-neutral-500 font-bold">
            로그인 불필요
          </span>
        </header>

        {/* Client Interactive Component */}
        <MemberHomeworkClient
          token={token}
          homework={result.homework!}
          member={result.member!}
          items={result.items || []}
          initialLogs={result.logs || []}
        />
      </div>

      <footer className="max-w-xl w-full mx-auto pt-8 text-center">
        <p className="text-xs font-mono text-neutral-500">
          운동숙제 — 기록은 수업으로 이어집니다
        </p>
      </footer>
    </div>
  );
}
