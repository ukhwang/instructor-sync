import type { Metadata } from "next";
// 빌드 시 Google Fonts 네트워크에 의존하지 않도록 Geist 를 패키지로 자체 호스팅한다 (CSS 변수명 동일).
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "운동숙제",
  description: "수업과 수업 사이, 회원의 몸을 이어주는 기록",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
