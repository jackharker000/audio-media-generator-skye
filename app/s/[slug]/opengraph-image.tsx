import { ImageResponse } from "next/og";
import { getShareCard } from "@/server/service";
import { genreLabel } from "@/shared/constants";

export const runtime = "nodejs";
export const alt = "A MnemoSong study song";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Mirror of the in-app Cover gradient so the share card matches the player. */
function hashInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getShareCard(slug).catch(() => null);

  const title = card?.title ?? "MnemoSong";
  const seed = card?.id ?? slug;
  const h = hashInt(seed);
  const a = h % 360;
  const b = ((Math.floor(h / 360) % 360) + 40) % 360;
  const tagline = card?.genre
    ? `${genreLabel(card.genre)} · a song to help you memorize it`
    : "Turn your notes into a song you'll remember";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "72px",
          color: "white",
          backgroundImage: `linear-gradient(135deg, hsl(${a} 72% 52%), hsl(${b} 70% 38%))`,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 700 }}>
          <span style={{ fontSize: 48, marginRight: 16 }}>🎵</span>
          MnemoSong
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 48 ? 64 : 84,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            {title.length > 90 ? `${title.slice(0, 90)}…` : title}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 34, opacity: 0.92 }}>{tagline}</div>
      </div>
    ),
    size,
  );
}
