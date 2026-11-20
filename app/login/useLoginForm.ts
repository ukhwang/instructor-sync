"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { credentialsSchema, signInWithEmail, signUpWithInvite } from "@/lib/auth-client";

/** Login / invite sign-up form logic (UI component stays presentational). */
export function useLoginForm(nextPath: string) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setMessage({ text: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.", error: true });
      return;
    }
    setLoading(true);
    const outcome = isSignUp ? await signUpWithInvite(parsed.data) : await signInWithEmail(parsed.data);
    setLoading(false);
    if (!outcome.ok) {
      setMessage({ text: outcome.message, error: true });
      return;
    }
    router.replace(nextPath);
    router.refresh();
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    isSignUp,
    toggleMode: () => setIsSignUp((value) => !value),
    loading,
    message,
    handleSubmit,
  };
}
