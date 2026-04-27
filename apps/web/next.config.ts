import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

const LOCAL_PREVIEW_ASSET_PREFIX =
  process.env.PERTH_GIG_FINDER_PREVIEW_ASSET_PREFIX;

function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>(["127.0.0.1", "localhost"]);

  for (const networkInterface of Object.values(networkInterfaces())) {
    for (const address of networkInterface ?? []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }

      origins.add(address.address);
    }
  }

  return [...origins];
}

function getImageRemotePatterns() {
  const patterns: RemotePattern[] = [
    {
      protocol: "https",
      hostname: "assets.oztix.com.au",
      pathname: "/**"
    },
    {
      protocol: "http",
      hostname: "127.0.0.1",
      port: "55321",
      pathname: "/storage/v1/object/public/gig-images/**"
    },
    {
      protocol: "http",
      hostname: "localhost",
      port: "55321",
      pathname: "/storage/v1/object/public/gig-images/**"
    }
  ];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      const protocol = url.protocol.replace(":", "") as "http" | "https";
      if (url.port) {
        patterns.push({
          protocol,
          hostname: url.hostname,
          port: url.port,
          pathname: "/storage/v1/object/public/gig-images/**"
        });
      } else {
        patterns.push({
          protocol,
          hostname: url.hostname,
          pathname: "/storage/v1/object/public/gig-images/**"
        });
      }
    } catch {
      // Ignore invalid runtime config and fall back to the static patterns.
    }
  }

  return patterns;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  assetPrefix: LOCAL_PREVIEW_ASSET_PREFIX || undefined,
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"]
  },
  images: {
    // Local Supabase Storage resolves to a private IP in development, so Next's
    // image optimizer needs this enabled to serve mirrored gig artwork locally.
    dangerouslyAllowLocalIP: true,
    imageSizes: [88, 115, 168, 176, 230, 336],
    qualities: [72, 75],
    remotePatterns: getImageRemotePatterns()
  },
  transpilePackages: ["@perth-gig-finder/shared"]
};

export default nextConfig;
