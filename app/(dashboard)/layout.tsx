import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Brain, PlusCircle, LayoutDashboard, LogOut } from "lucide-react";
import { MobileSidebar } from "@/components/MobileSidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, plan")
    .eq("id", user.id)
    .single();

  const safeProfile = profile ?? { credits: 0, plan: "free" };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* 모바일 헤더 (모바일 전용) */}
      <header className="md:hidden flex items-center justify-between p-4 bg-white border-b shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-600">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-sm">I.K.S</span>
        </div>
        <MobileSidebar safeProfile={safeProfile} />
      </header>

      {/* 사이드바 (데스크톱 전용) */}
      <aside className="w-60 shrink-0 border-r bg-white hidden md:flex flex-col">
        {/* 로고 */}
        <a href="/dashboard" 
           className="p-5 border-b flex items-center gap-2.5 
                      hover:bg-accent transition-colors">
          <div className="p-1.5 rounded-lg bg-blue-600">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-sm">I.K.S</span>
        </a>

        {/* 네비 */}
        <nav className="flex-1 p-3 space-y-1">
          <a
            href="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            대시보드
          </a>
          <a
            href="/new"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            새 분석 시작
          </a>
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

          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </form>
        </div>
      </aside>

      {/* 메인 */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
