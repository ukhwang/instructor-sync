import 'server-only';
import { appDatabase } from '@/lib/server/db/pools';

export type TrainerAccess = Readonly<{ trainerId: string; active: boolean }>;

export async function getTrainerAccess(request: Request): Promise<TrainerAccess | null> {
  const { auth } = await import('./index');
  const session = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } });
  if (!session) return null;
  const { rows } = await appDatabase().query<{ id: string; active: boolean }>(
    'select id, active from app.trainers where id=$1',
    [session.user.id],
  );
  const trainer = rows[0];
  return trainer ? Object.freeze({ trainerId: trainer.id, active: trainer.active }) : Object.freeze({ trainerId: session.user.id, active: false });
}
