import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, PlusCircle, Clock } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: reports } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const isEmpty = !reports || reports.length === 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">분석 히스토리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            이전에 분석한 교안 리포트를 확인합니다.
          </p>
        </div>
        <a
          href="/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          새 분석
        </a>
      </div>

      {isEmpty ? (
        <div className="text-center py-20 space-y-4">
          <div className="flex justify-center">
            <div className="p-5 rounded-full bg-slate-100">
              <FileText className="w-10 h-10 text-slate-400" />
            </div>
          </div>
          <h2 className="font-semibold text-lg">아직 분석한 교안이 없습니다</h2>
          <p className="text-muted-foreground text-sm">
            강의 자료를 업로드하고 지식 갭을 발견해보세요.
          </p>
          <a
            href="/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors mt-2"
          >
            <PlusCircle className="w-4 h-4" />
            첫 분석 시작하기
          </a>
        </div>
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => (
            <a key={report.id} href={`/report/${report.id}`}>
              <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 mt-0.5">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold group-hover:text-blue-600 transition-colors">
                        {report.document_name}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {report.topic}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(report.created_at).toLocaleDateString("ko-KR")}
                        </span>
                        {report.total_gaps > 0 && (
                          <Badge variant="outline" className="text-xs">
                            갭 {report.total_gaps}개
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold text-blue-600">
                      {report.overall_score}
                    </p>
                    <p className="text-xs text-muted-foreground">최신화 점수</p>
                  </div>
                </div>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
