import { notFound } from "next/navigation";
import Link from "next/link";
import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import { getSongView } from "@/server/service";
import { SongPlayer } from "@/components/SongPlayer";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  if (!features.hasDb()) return <SetupNotice />;
  const userId = await requireUserPage();
  const { id } = await params;
  const view = await getSongView(userId, id);
  if (!view) notFound();
  const { song, facts, lines } = view;

  return (
    <div className="space-y-4">
      <Link href={`/projects/${song.projectId}`} className="text-sm text-slate-500 hover:underline">
        ← Back to notebook
      </Link>
      <SongPlayer
        canEdit
        facts={facts.map((f) => ({ factId: f.factId, claim: f.claim, importance: f.importance }))}
        lines={(lines ?? []).map((l) => ({
          section: l.section,
          text: l.text,
          factIds: l.factIds ?? [],
        }))}
        song={{
          id: song.id,
          title: song.title,
          description: song.description,
          lyrics: song.lyrics,
          genre: song.params.genre,
          isPublic: song.isPublic,
          visibility: song.visibility,
          version: song.version,
          projectId: song.projectId,
        }}
      />
    </div>
  );
}
