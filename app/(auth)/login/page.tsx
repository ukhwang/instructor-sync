"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Brain, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error("이메일과 비밀번호를 입력하세요.");
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("로그인 실패: " + error.message);
    } else {
      router.push("/dashboard");
    }
    setIsLoading(false);
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="w-full max-w-md p-8 rounded-2xl border bg-white shadow-sm space-y-6">
        {/* 로고 */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="p-3 rounded-xl bg-blue-600">
              <Brain className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">I.K.S</h1>
          <p className="text-sm text-muted-foreground">Instructor's Knowledge Sync</p>
        </div>

        {/* 폼 */}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button
            className="w-full"
            onClick={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            로그인
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs text-muted-foreground">
            <span className="bg-white px-2">또는</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogleLogin}>
          Google로 계속하기
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          계정이 없으신가요?{" "}
          <a href="/signup" className="text-blue-600 hover:underline font-medium">
            회원가입
          </a>
        </p>
      </div>
    </div>
  );
}
