import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "MnemoSong — turn your notes into a song you'll remember";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Branded default social card for the site (pages without their own image). */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "80px",
          color: "white",
          backgroundImage: "linear-gradient(135deg, #4f46e5, #312e81)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 44, fontWeight: 700 }}>
          <span style={{ fontSize: 52, marginRight: 18 }}>🎵</span>
          MnemoSong
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          Turn your notes into a song you&apos;ll remember
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 34, opacity: 0.9 }}>
          Upload your material → get a catchy, fact-checked study song.
        </div>
      </div>
    ),
    size,
  );
}
