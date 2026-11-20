import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Vercel Image Optimization(/_next/image)을 전역으로 끈다.
  // 운동 GIF·포스터는 GitHub(raw.githubusercontent.com)에서 브라우저가 직접 받고,
  // 앱은 지금 <img>/<video>를 쓰므로 변환 호출이 0회다. 나중에 누가 next/image로 바꿔도
  // Vercel 이미지 변환 과금·한도 소모 경로가 다시 열리지 않게 미리 잠근다.
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        // public/ 정적 이미지: 내용이 바뀌면 파일명을 바꾸는 자산만 둔다.
        source: "/exercise-media/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // keep-alive 핑은 CDN·브라우저 캐시에 먹히면 DB 활동이 0이 된다.
        source: "/api/health",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
