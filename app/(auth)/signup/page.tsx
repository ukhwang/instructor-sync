"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Brain, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const supabase = createClient();

  const handleSignup = async () => {
    if (!email || !password) {
      toast.error("이메일과 비밀번호를 입력하세요.");
      return;
    }
    if (password.length < 6) {
      toast.error("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      toast.error("회원가입 실패: " + error.message);
    } else {
      // Supabase에서 '이메일 인증'을 껐다면 즉시 세션이 발급됩니다.
      if (data.session) {
        window.location.href = "/dashboard";
      } else {
        setDone(true);
      }
    }
    setIsLoading(false);
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center space-y-4 p-8">
          <div className="text-4xl">📧</div>
          <h2 className="text-xl font-bold">이메일을 확인하세요</h2>
          <p className="text-muted-foreground text-sm">
            {email}로 인증 링크를 보냈습니다.
          </p>
          <a href="/login" className="text-blue-600 hover:underline text-sm">
            로그인으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="w-full max-w-md p-8 rounded-2xl border bg-white shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="p-3 rounded-xl bg-blue-600">
              <Brain className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">회원가입</h1>
          <p className="text-sm text-muted-foreground">무료로 시작하세요 (3회 분석 제공)</p>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSignup()}
            className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button className="w-full" onClick={handleSignup} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            회원가입
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <a href="/login" className="text-blue-600 hover:underline font-medium">
            로그인
          </a>
        </p>
      </div>
    </div>
  );
}
