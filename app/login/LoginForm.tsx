"use client";

import Link from "next/link";
import { useLoginForm } from "./useLoginForm";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const { email, setEmail, password, setPassword, isSignUp, toggleMode, loading, message, handleSubmit } =
    useLoginForm(nextPath);

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
                autoComplete="email"
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
                placeholder="12자 이상"
                minLength={12}
                maxLength={128}
                autoComplete={isSignUp ? "new-password" : "current-password"}
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
              onClick={toggleMode}
              className="text-neutral-700 hover:text-black underline"
            >
              {isSignUp
                ? "이미 계정이 있으신가요? 로그인"
                : "초대받으셨나요? 회원가입"}
            </button>
          </div>

        </div>

        {/* 로그인 없이 체험: DB·인증과 무관한 클라이언트 샌드박스(/demo). 프로덕션에서도 항상 노출. */}
        <Link
          href="/demo"
          className="mt-4 flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-[var(--ui-radius-md)] border-2 border-black bg-white px-4 py-3 text-center transition-transform active:scale-[0.98]"
        >
          <span className="text-base font-black">로그인 없이 1분 체험하기</span>
          <span className="text-xs font-bold text-neutral-600">
            샘플 데이터로 원장 화면을 바로 체험합니다 · 저장되지 않음
          </span>
        </Link>
      </div>
    </div>
  );
}
