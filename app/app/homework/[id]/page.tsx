import { HomeworkDetailClient } from "./HomeworkDetailClient";
import { getHomeworkById } from "@/lib/db-server";
import { requireTrainerPage } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/** Owner-scoped read; another trainer's homework id renders "not found". */
export default async function HomeworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireTrainerPage(`/app/homework/${id}`);
  const homework = await getHomeworkById(id);
  return <HomeworkDetailClient homeworkId={id} homework={homework} />;
}
