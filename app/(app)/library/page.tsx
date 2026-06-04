import Link from "next/link";
import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import { listSongs } from "@/server/service";
import { LibraryClient } from "@/components/LibraryClient";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  if (!features.hasDb()) return <SetupNotice />;
  const userId = await requireUserPage();
  const songs = await listSongs(userId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your library</h1>
      {songs.length === 0 ? (
        <p className="text-sm text-slate-500">
          No songs yet.{" "}
          <Link href="/projects" className="text-brand-700 underline">
            Make one →
          </Link>
        </p>
      ) : (
        <LibraryClient
          songs={songs.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            genre: s.params.genre,
            isPublic: s.isPublic,
            createdAt: s.createdAt,
          }))}
        />
      )}
    </div>
  );
}
