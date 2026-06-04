import { notFound } from "next/navigation";
import Link from "next/link";
import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import { getViewableSongView } from "@/server/service";
import { SongPlayer } from "@/components/SongPlayer";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function FriendSongPage({ params }: { params: Promise<{ id: string }> }) {
  if (!features.hasDb()) return <SetupNotice />;
  const viewerId = await requireUserPage();
  const { id } = await params;
  const view = await getViewableSongView(viewerId, id);
  if (!view) notFound();
  const { song, facts, lines } = view;

  return (
    <div className="space-y-4">
      <Link href="/friends" className="text-sm text-slate-500 hover:underline">
        ← Back to friends
      </Link>
      <SongPlayer
        canEdit={false}
        audioSrc={`/api/friends/songs/${song.id}/audio`}
        facts={facts}
        lines={lines}
        song={{
          id: song.id,
          title: song.title,
          description: song.description,
          lyrics: song.lyrics,
          genre: song.params?.genre,
          isPublic: song.isPublic,
          version: song.version,
        }}
      />
    </div>
  );
}
