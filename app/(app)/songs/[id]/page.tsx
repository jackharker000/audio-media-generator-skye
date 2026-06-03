import { notFound } from "next/navigation";
import Link from "next/link";
import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import { getSong } from "@/server/service";
import { SongPlayer } from "@/components/SongPlayer";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  if (!features.hasDb()) return <SetupNotice />;
  const userId = await requireUserPage();
  const { id } = await params;
  const song = await getSong(userId, id);
  if (!song) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/projects/${song.projectId}`} className="text-sm text-slate-500 hover:underline">
        ← Back to notebook
      </Link>
      <SongPlayer
        canEdit
        song={{
          id: song.id,
          title: song.title,
          description: song.description,
          lyrics: song.lyrics,
          genre: song.params.genre,
          isPublic: song.isPublic,
          version: song.version,
        }}
      />
    </div>
  );
}
