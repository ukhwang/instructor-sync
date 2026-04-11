import { redirect } from "next/navigation";

/** Google OAuth로 최초 로그인 시 자동 가입되므로 별도 회원가입 페이지는 사용하지 않습니다. */
export default function SignupPage() {
  redirect("/login");
}
