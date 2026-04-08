"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LayoutDashboard, PlusCircle, Brain, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface MobileSidebarProps {
  safeProfile: { credits: number; plan: string };
}

export function MobileSidebar({ safeProfile }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleNav = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0 flex flex-col bg-white">
        {/* 로고 */}
        <div className="p-5 border-b flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-600">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-sm">I.K.S</span>
        </div>

        {/* 네비 */}
        <nav className="flex-1 p-3 space-y-1">
          <button
            onClick={() => handleNav("/dashboard")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            대시보드
          </button>
          <button
            onClick={() => handleNav("/new")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            새 분석 시작
          </button>
        </nav>

        {/* 하단: 크레딧 + 로그아웃 */}
        <div className="p-4 border-t space-y-3">
          <div className="rounded-lg bg-slate-50 p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">남은 분석 횟수</span>
              <span className="font-bold text-blue-600">
                {safeProfile.credits}회
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{ width: `${(safeProfile.credits / 3) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {safeProfile.plan === "free" ? "Free 플랜 · 3회 제공" : "Pro 플랜"}
            </p>
          </div>

          <form action="/api/auth/signout" method="POST" onSubmit={() => setOpen(false)}>
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
