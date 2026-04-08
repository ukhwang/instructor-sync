import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center space-y-6 px-4">
      <div className="p-4 rounded-full bg-slate-100">
        <FileQuestion className="w-12 h-12 text-slate-400" />
      </div>
      <div>
        <h1 className="text-2xl font-bold mb-2">페이지를 찾을 수 없습니다</h1>
        <p className="text-muted-foreground text-sm">요청하신 페이지의 주소가 잘못되었거나 삭제되었습니다.</p>
      </div>
      <Link href="/">
        <Button>홈으로 돌아가기</Button>
      </Link>
    </div>
  );
}
