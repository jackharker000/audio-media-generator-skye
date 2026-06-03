import Link from "next/link";
import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import { listSongs } from "@/server/service";
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
          No songs yet. <Link href="/projects" className="text-brand-700 underline">Make one →</Link>
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {songs.map((s) => (
            <li key={s.id}>
              <Link href={`/songs/${s.id}`} className="card block hover:border-brand-300">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">🎵 {s.title}</h3>
                  {s.isPublic && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      shared
                    </span>
                  )}
                </div>
                {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}
                <p className="mt-2 text-xs text-slate-400">
                  {s.params.genre ?? "song"} · {new Date(s.createdAt).toLocaleDateString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
