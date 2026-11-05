import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Uploads (logo up to 5 MB, business photos up to 15 MB each) go through Server Actions,
    // whose default 1 MB limit rejected them with "Body exceeded 1 MB limit".
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default nextConfig;
