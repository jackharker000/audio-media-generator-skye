import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { features } from "@/lib/env";
import { getShareBySlug, getShareCard } from "@/server/service";
import { SongPlayer } from "@/components/SongPlayer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (!features.hasDb()) return { title: "MnemoSong" };
  const { slug } = await params;
  const card = await getShareCard(slug).catch(() => null);
  if (!card) return { title: "MnemoSong" };

  const title = `${card.title} — MnemoSong`;
  const description =
    card.description ?? "A catchy, fact-checked study song — listen and learn on MnemoSong.";
  // og:image / twitter:image are supplied automatically by opengraph-image.tsx.
  return {
    title,
    description,
    openGraph: {
      type: "music.song",
      siteName: "MnemoSong",
      title: card.title,
      description,
    },
    twitter: { card: "summary_large_image", title: card.title, description },
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  if (!features.hasDb()) notFound();
  const { slug } = await params;
  const found = await getShareBySlug(slug).catch(() => null);
  if (!found) notFound();
  const { song, facts, lines } = found;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Shared via MnemoSong 🎵</p>
      <SongPlayer
        canEdit={false}
        facts={facts}
        lines={lines ?? []}
        audioSrc={`/api/s/${slug}/audio`}
        quizSrc={`/api/s/${slug}/quiz`}
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
