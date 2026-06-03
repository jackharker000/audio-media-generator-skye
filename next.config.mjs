/** @type {import('next').NextConfig} */
const nextConfig = {
  // The pipeline + several adapters are server-only and pull in Node built-ins
  // and large native deps (ffmpeg, pdf, mammoth). Keep them external to the
  // server bundle so they are required at runtime instead of bundled.
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "@google-cloud/text-to-speech",
    "fluent-ffmpeg",
    "ffmpeg-static",
    "unpdf",
    "mammoth",
  ],
  eslint: {
    // Lint is run separately in CI; don't fail production builds on lint.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Server Actions are used for some mutations.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
