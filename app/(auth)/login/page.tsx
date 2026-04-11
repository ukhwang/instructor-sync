"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Brain, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth_failed") {
      const detail = params.get("detail");
      let decoded = "";
      if (detail) {
        try {
          decoded = decodeURIComponent(detail);
        } catch {
          decoded = detail;
        }
      }
      const msg = decoded
        ? `로그인 실패: ${decoded}`
        : "로그인 처리에 실패했습니다. Supabase Redirect URL·Google 리디렉션 URI를 확인해 주세요.";
      toast.error(msg);
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      // 반드시 현재 주소 기준 (초기 커밋과 동일). NEXT_PUBLIC_URL을 쓰면 프리뷰/별도 도메인에서 OAuth가 깨짐.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) {
        toast.error(error.message || "Google 로그인을 시작할 수 없습니다.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "로그인 요청 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-sm p-8 rounded-2xl border bg-white shadow-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-3 rounded-xl bg-blue-600">
              <Brain className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">I.K.S</h1>
          <p className="text-sm text-muted-foreground">Instructor&apos;s Knowledge Sync</p>
        </div>

        <div className="space-y-4 text-center">
          <p className="text-sm text-foreground/90 leading-relaxed">
            서비스 이용을 위해 로그인이 필요합니다.
            <br />
            <span className="text-muted-foreground">
              Google 계정으로 안전하게 연결됩니다.
            </span>
          </p>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 text-[15px] font-medium border-slate-200 bg-white hover:bg-slate-50 shadow-sm"
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2 shrink-0" aria-hidden />
            ) : (
              <svg className="w-5 h-5 mr-2 shrink-0" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}
