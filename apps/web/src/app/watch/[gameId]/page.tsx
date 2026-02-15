import { redirect } from 'next/navigation';

/** Redirect legacy /watch/5 to /watch/lobby/5 */
export default async function WatchGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!gameId) redirect('/watch');
  redirect(`/watch/lobby/${gameId}`);
}
