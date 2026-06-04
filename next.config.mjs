/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server-only packages with native/Node deps: keep them external to the
  // server bundle so they're required at runtime rather than bundled.
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "@google-cloud/storage",
    "@google-cloud/text-to-speech",
    "@gradio/client",
    "fluent-ffmpeg",
    "ffmpeg-static",
    "unpdf",
    "mammoth",
  ],
  eslint: {
    // Lint runs separately in CI; don't fail production builds on lint.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  // The SSE route runs the pipeline (incl. optional ffmpeg beat-mixing); bundle
  // the static ffmpeg binary so it's available on Vercel. If absent, the Google
  // TTS engine gracefully falls back to speech-only.
  outputFileTracingIncludes: {
    "/api/jobs/[id]/stream": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  // Baseline security headers applied to every route. We intentionally avoid a
  // strict Content-Security-Policy here: Next.js / Vercel rely on inline
  // bootstrap scripts and a strict CSP would break hydration without a nonce
  // pipeline. The headers below are safe defaults that don't affect rendering.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
