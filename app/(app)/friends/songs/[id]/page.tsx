import { notFound } from "next/navigation";
import Link from "next/link";
import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import { getViewableSong } from "@/server/friends";
import { Cover } from "@/components/Cover";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function FriendSongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!features.hasDb()) return <SetupNotice />;
  const viewerId = await requireUserPage();
  const { id } = await params;
  const song = await getViewableSong(viewerId, id);
  if (!song) notFound();

  return (
    <div className="space-y-4">
      <Link href="/friends" className="text-sm text-slate-500 hover:underline">
        ← Back to friends
      </Link>

      <div className="card space-y-4">
        <div className="flex items-center gap-4">
          <Cover seed={song.id} title={song.title} className="h-16 w-16 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{song.title}</h1>
            {song.description && (
              <p className="text-sm text-slate-600">{song.description}</p>
            )}
            {song.params?.genre && (
              <p className="text-xs text-slate-400">{song.params.genre}</p>
            )}
          </div>
        </div>

        {song.audioStorageKey ? (
          <audio className="w-full" controls src={`/api/friends/songs/${song.id}/audio`} />
        ) : (
          <p className="text-sm text-slate-500">No audio available.</p>
        )}
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Lyrics</h2>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
          {song.lyrics}
        </pre>
      </div>
    </div>
  );
}
