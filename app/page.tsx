import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Brain, Zap, Shield, BarChart3 } from "lucide-react";

const FEATURES = [
  {
    icon: Zap,
    title: "실시간 지식 갭 탐지",
    desc: "최신 웹 데이터와 교안을 자동 대조해 구식 정보를 빨간색으로 하이라이트합니다.",
  },
  {
    icon: Shield,
    title: "강사 전문성 방어",
    desc: "수업 전 지식 갭을 선제적으로 제거해 돌발 질문에 완벽히 대비합니다.",
  },
  {
    icon: BarChart3,
    title: "최신화 점 시각화",
    desc: "교안의 최신화 점수를 0~100으로 정량화해 직관적으로 파악합니다.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* 헤더 */}
      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-600">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold">I.K.S</span>
        </div>
        <a
          href="/login"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          로그인
        </a>
      </header>

      {/* 히어로 */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
          <Zap className="w-3 h-3" />
          AI 기반 교강사 전용 지식 동기화 툴
        </div>
        <h1 className="text-5xl font-bold leading-tight">
          강의 교안의{" "}
          <span className="text-blue-600">지식 갭</span>을<br />
          AI가 자동으로 찾아드립니다
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          PDF 교안을 업로드하면 최신 웹 데이터와 자동 대조하여
          구식 정보와 누락된 트렌드를 10분 이내에 파악합니다.
        </p>
        <div className="flex items-center justify-center pt-4">
          <a
            href="/login"
            className="px-8 py-3.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors text-lg min-w-[200px] text-center"
          >
            로그인하고 시작하기 →
          </a>
        </div>
        <p className="text-sm text-muted-foreground">무료 플랜 · 분석 3회 제공 · 신용카드 불필요</p>
      </section>

      {/* 기능 */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-2xl border bg-white p-6 space-y-3 shadow-sm">
                <div className="p-2.5 rounded-xl bg-blue-50 w-fit">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
