import { TrainerNav } from "@/components/TrainerNav";
import { MotionPageTransition } from "@/components/motion/MotionPageTransition";

export const dynamic = "force-dynamic";

export default function TrainerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#f7f7f5] text-[#111111]">
      <TrainerNav />
      <main className="w-full flex-1 brutalist-container py-6 md:py-8">
        <MotionPageTransition>{children}</MotionPageTransition>
      </main>
      <footer className="border-t-2 border-black bg-white py-4 mt-12">
        <div className="brutalist-container flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-neutral-600">
          <span>운동숙제 MSP — 수업과 수업 사이 회원의 몸을 이어주는 기록</span>
          <span>한국어 UI (Asia/Seoul)</span>
        </div>
      </footer>
    </div>
  );
}
