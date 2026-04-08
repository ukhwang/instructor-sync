import { Skeleton } from "@/components/ui/skeleton";

export default function ReportLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-pulse">
      {/* 헤더 스켈레톤 */}
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
          <div className="space-y-3 pt-1">
            <Skeleton className="h-7 w-64 md:w-96" />
            <div className="flex items-center gap-4">
               <Skeleton className="h-4 w-24" />
               <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </div>
      
      {/* 메인 리포트 구역 스켈레톤 */}
      <div className="flex flex-col md:flex-row items-start gap-8">
        <Skeleton className="md:w-64 w-full h-48 rounded-2xl shrink-0" />
        <div className="flex-1 w-full space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-full h-40 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
