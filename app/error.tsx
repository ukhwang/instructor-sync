"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center space-y-6 px-4">
      <div className="p-4 rounded-full bg-red-50">
        <AlertCircle className="w-12 h-12 text-red-500" />
      </div>
      <div>
        <h1 className="text-2xl font-bold mb-2">오류가 발생했습니다</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {error.message || "예기치 못한 시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요."}
        </p>
      </div>
      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={() => window.history.back()}>
          이전 페이지
        </Button>
        <Button onClick={() => reset()} className="bg-blue-600 hover:bg-blue-700">
          실행 취소 후 재시도
        </Button>
      </div>
    </div>
  );
}
