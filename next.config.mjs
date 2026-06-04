/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server-only packages with native/Node deps: keep them external to the
  // server bundle so they're required at runtime rather than bundled.
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "@google-cloud/storage",
    "@google-cloud/text-to-speech",
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
};

export default nextConfig;
