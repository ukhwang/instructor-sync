"use client";

import { CalendarDays, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { DEMO_TRAINER } from "@/lib/demo-seed";
import { cn } from "@/lib/utils";

import { DemoProvider } from "./DemoProvider";

const DEMO_TABS = [
  { label: "스케줄", href: "/demo", icon: CalendarDays },
  { label: "회원", href: "/demo/members", icon: Users },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/demo" ? pathname === "/demo" : pathname.startsWith(href);
}

function DemoSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="체험 화면 준비 중">
      <div className="h-14 w-48 rounded-xl bg-slate-200/70 motion-safe:animate-pulse" />
      <div className="h-16 rounded-[var(--ui-radius-md)] bg-slate-200/70 motion-safe:animate-pulse" />
      <div className="h-[420px] rounded-[var(--ui-radius-md)] bg-slate-200/70 motion-safe:animate-pulse" />
    </div>
  );
}

/** /demo 전용 레이아웃: 체험 안내 바 + 데모 탭. 프로덕션 TrainerNav(로그아웃 등)는 쓰지 않는다. */
export function DemoShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--ui-bg)] text-[var(--ui-text)]">
      <div className="sticky top-0 z-40 border-b border-[var(--ui-border)] bg-white">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center gap-3 px-4">
          <span className="shrink-0 rounded-full bg-[var(--ui-accent)] px-2.5 py-1 text-xs font-black text-white">체험 모드</span>
          <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-[var(--ui-text-secondary)] sm:text-sm">
            <span className="block">실제 데이터는 저장되지 않습니다</span>
            <span className="hidden truncate text-[11px] sm:block">
              {DEMO_TRAINER.studioName} · {DEMO_TRAINER.name} 원장 (샘플)
            </span>
          </p>
          <nav className="hidden items-center gap-1 md:flex" aria-label="체험 메뉴">
            {DEMO_TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive(pathname, tab.href) ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center gap-1.5 rounded-xl px-4 text-sm font-bold transition-transform active:scale-95",
                  isActive(pathname, tab.href)
                    ? "bg-[var(--ui-accent-light)] text-[var(--ui-accent)]"
                    : "text-neutral-600 hover:bg-[var(--ui-accent-light)]",
                )}
              >
                <tab.icon className="size-4" aria-hidden />
                {tab.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/login"
            className="flex h-12 shrink-0 items-center rounded-xl bg-zinc-900 px-4 text-sm font-bold text-white transition-transform active:scale-95"
          >
            내 센터 시작하기
          </Link>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+96px)] md:py-8 md:pb-10">
        <DemoProvider fallback={<DemoSkeleton />}>{children}</DemoProvider>
      </main>

      {/* 모바일 하단 탭 (64px 터치 타깃) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ui-border)] bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="체험 메뉴"
      >
        <div className="grid grid-cols-2">
          {DEMO_TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive(pathname, tab.href) ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold transition-transform active:scale-95",
                isActive(pathname, tab.href) ? "text-[var(--ui-accent)]" : "text-neutral-500",
              )}
            >
              <tab.icon className="size-5" aria-hidden />
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
