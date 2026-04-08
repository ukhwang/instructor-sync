import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>
      <div className="grid gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-5 border rounded-xl bg-white shadow-sm flex items-start gap-4">
            <Skeleton className="h-9 w-9 rounded-lg shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1 pt-1">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
            <div className="w-16 space-y-2 shrink-0 flex flex-col items-end pt-1">
               <Skeleton className="h-8 w-12" />
               <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
