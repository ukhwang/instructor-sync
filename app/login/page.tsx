"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/demo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: email.split("@")[0] },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setMessage({
          text: "회원가입이 완료되었습니다. 확인 이메일을 확인하시거나 로그인해주세요.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/app");
      }
    } catch (err: unknown) {
      const text =
        err instanceof Error ? err.message : "로그인 처리 중 오류가 발생했습니다.";
      setMessage({ text, error: true });
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    router.push("/app");
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#111111] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-block bg-black text-white text-2xl font-black px-4 py-1.5 border-2 border-black tracking-tight uppercase"
          >
            운동숙제
          </Link>
          <p className="mt-2 text-sm font-bold text-neutral-700">
            강사 전용 로그인 / 2분 만에 숙제 링크 생성
          </p>
        </div>

        {/* Login Box */}
        <div className="brutalist-box p-6 md:p-8 bg-white">
          <h2 className="text-xl font-black mb-4">
            {isSignUp ? "강사 회원가입" : "강사 로그인"}
          </h2>

          {message && (
            <div
              className={`p-3 mb-4 font-bold text-xs border-2 border-black ${
                message.error ? "bg-red-100 text-red-900" : "bg-green-100 text-green-900"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase mb-1 font-mono">
                강사 이메일
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trainer@gym.com"
                className="brutalist-input"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase mb-1 font-mono">
                비밀번호
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="brutalist-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full brutalist-btn-primary py-3 text-base font-black mt-2"
            >
              {loading
                ? "처리 중..."
                : isSignUp
                ? "강사 계정 생성하기"
                : "대시보드 로그인"}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t-2 border-black flex items-center justify-between text-xs font-bold">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-neutral-700 hover:text-black underline"
            >
              {isSignUp
                ? "이미 계정이 있으신가요? 로그인"
                : "계정이 없으신가요? 회원가입"}
            </button>
          </div>

          {isDemoMode() && (
            <div className="mt-6 pt-4 border-t-2 border-dashed border-neutral-400">
              <button
                type="button"
                onClick={handleDemoLogin}
                className="w-full brutalist-btn-yellow py-2.5 text-xs font-black"
              >
                데모 모드로 입장
              </button>
              <p className="text-[11px] text-center text-neutral-500 font-mono mt-1">
                샘플 데이터로 핵심 흐름을 바로 확인합니다
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
