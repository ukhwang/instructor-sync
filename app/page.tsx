import Link from "next/link";
import { COPY } from "@/lib/copy";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#111111] flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b-4 border-black bg-white">
        <div className="brutalist-container py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-black text-white text-xl font-black px-3 py-1 border-2 border-black tracking-tight">
              {COPY.BRAND_NAME}
            </span>
            <span className="hidden sm:inline font-mono text-xs font-bold text-neutral-600">
              MSP v1.0
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-bold px-4 py-2 border-2 border-black bg-white hover:bg-neutral-100 transition-colors"
            >
              강사 로그인
            </Link>
            <Link
              href="/login"
              className="text-sm font-bold px-4 py-2 border-2 border-black bg-yellow-400 hover:bg-yellow-300 shadow-[3px_3px_0px_0px_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              강사 시작하기
            </Link>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="brutalist-container py-12 md:py-20 flex-1">
        <div className="max-w-3xl">
          <div className="inline-block font-mono text-xs font-bold bg-neutral-200 border-2 border-black px-3 py-1 mb-6">
            B2B 피트니스 SaaS — 수업↔수업 연결 장치
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight mb-6">
            피트니스 CRM이 아닙니다.
            <br />
            <span className="bg-yellow-300 px-2 border-2 border-black inline-block mt-2">
              회원 기록을 다음 수업으로 잇는
            </span>
            <br />
            운동숙제 루프입니다.
          </h1>

          <p className="text-lg md:text-xl font-bold text-neutral-800 leading-relaxed mb-8 border-l-4 border-black pl-4">
            수업과 수업 사이에 회원이 숙제를 확인하고, 해본 뒤 느낀 점을 남기게 해
            강사가 다음 수업을 준비할 수 있게 합니다.
          </p>

          <div className="flex flex-wrap gap-4 mb-14">
            <Link
              href="/login"
              className="text-base md:text-lg font-black px-6 py-3.5 bg-black text-white border-2 border-black shadow-[4px_4px_0px_0px_#000] hover:bg-neutral-800 active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              강사 시작하기 (2분 완성) →
            </Link>
            <Link
              href="/login"
              className="text-base md:text-lg font-bold px-6 py-3.5 bg-white text-black border-2 border-black shadow-[4px_4px_0px_0px_#000] hover:bg-neutral-100 active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              이미 계정이 있으면 로그인
            </Link>
          </div>
        </div>

        {/* 4 Brutalist Core Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="brutalist-box p-6 bg-white">
            <div className="font-mono text-xs font-black bg-black text-white inline-block px-2 py-0.5 mb-3">
              PILLAR 01
            </div>
            <h3 className="text-xl font-black mb-2">카카오톡 링크 1개로 전달</h3>
            <p className="text-sm font-medium text-neutral-700 leading-relaxed">
              회원은 앱 설치도, 회원가입도 필요 없습니다. 카톡에 복사해 붙여넣는 URL 하나로
              10초 만에 오늘 할 동작을 확인합니다.
            </p>
          </div>

          <div className="brutalist-box p-6 bg-white">
            <div className="font-mono text-xs font-black bg-black text-white inline-block px-2 py-0.5 mb-3">
              PILLAR 02
            </div>
            <h3 className="text-xl font-black mb-2">‘완료’와 ‘못 함’의 동일한 위계</h3>
            <p className="text-sm font-medium text-neutral-700 leading-relaxed">
              못 했다고 의지를 탓하지 않습니다. 완료/못함 모두 1-Tap으로 동등하게 기록되고,
              남겨진 통증과 피드백은 다음 수업의 첫 대화 주제가 됩니다.
            </p>
          </div>

          <div className="brutalist-box p-6 bg-white">
            <div className="font-mono text-xs font-black bg-black text-white inline-block px-2 py-0.5 mb-3">
              PILLAR 03
            </div>
            <h3 className="text-xl font-black mb-2">다음 수업 오프닝 멘트 자동 완성</h3>
            <p className="text-sm font-medium text-neutral-700 leading-relaxed">
              “지난주 숙제는 어떠셨는지, 남겨주신 느낌부터 확인하고 오늘 수업을 시작할게요.”
              회원 기록을 바탕으로 강사가 수업 시작 전에 읽을 문장을 준비합니다.
            </p>
          </div>

          <div className="brutalist-box p-6 bg-white">
            <div className="font-mono text-xs font-black bg-black text-white inline-block px-2 py-0.5 mb-3">
              PILLAR 04
            </div>
            <h3 className="text-xl font-black mb-2">잔여 4회: 재등록 상담 준비</h3>
            <p className="text-sm font-medium text-neutral-700 leading-relaxed">
              만료가 임박하면 회원 기록을 바탕으로 상담 문장을 준비합니다.
              회원의 현재 상태를 확인하고 다음 수업 방향을 함께 상의할 수 있습니다.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-4 border-black bg-white py-6">
        <div className="brutalist-container flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div>
            <strong>운동숙제</strong> — B2B Fitness Homework Loop MSP
          </div>
          <div className="text-neutral-600">
            Next.js 15 App Router + Supabase + TanStack Query + Zustand
          </div>
        </div>
      </footer>
    </div>
  );
}
