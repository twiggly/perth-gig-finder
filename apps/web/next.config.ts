import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import type {
  LocalPattern,
  RemotePattern
} from "next/dist/shared/lib/image-config";

const LOCAL_PREVIEW_ASSET_PREFIX =
  process.env.PERTH_GIG_FINDER_PREVIEW_ASSET_PREFIX;
const GIG_IMAGE_STORAGE_PATHNAME =
  "/storage/v1/object/public/gig-images/**";
const LOOPBACK_IMAGE_HOSTNAMES = new Set([
  "127.0.0.1",
  "localhost",
  "[::1]"
]);
const LOCAL_IMAGE_PATTERNS: LocalPattern[] = [
  {
    pathname: "/venue-placeholders/**",
    search: ""
  }
];
const OZTIX_IMAGE_PATTERN: RemotePattern = {
  protocol: "https",
  hostname: "assets.oztix.com.au",
  port: "",
  pathname: "/image/**",
  search: ""
};

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

export function getImageSourcePolicy(supabaseUrl?: string): {
  dangerouslyAllowLocalIP: boolean;
  remotePatterns: RemotePattern[];
} {
  const remotePatterns: RemotePattern[] = [{ ...OZTIX_IMAGE_PATTERN }];

  if (!supabaseUrl) {
    return {
      dangerouslyAllowLocalIP: false,
      remotePatterns
    };
  }

  try {
    const url = new URL(supabaseUrl);
    const protocol =
      url.protocol === "http:"
        ? "http"
        : url.protocol === "https:"
          ? "https"
          : null;

    if (!protocol) {
      return {
        dangerouslyAllowLocalIP: false,
        remotePatterns
      };
    }

    remotePatterns.push({
      protocol,
      hostname: url.hostname,
      port: url.port,
      pathname: GIG_IMAGE_STORAGE_PATHNAME
    });

    return {
      dangerouslyAllowLocalIP: LOOPBACK_IMAGE_HOSTNAMES.has(url.hostname),
      remotePatterns
    };
  } catch {
    return {
      dangerouslyAllowLocalIP: false,
      remotePatterns
    };
  }
}

const imageSourcePolicy = getImageSourcePolicy(
  process.env.NEXT_PUBLIC_SUPABASE_URL
);

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  assetPrefix: LOCAL_PREVIEW_ASSET_PREFIX || undefined,
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"]
  },
  images: {
    dangerouslyAllowLocalIP: imageSourcePolicy.dangerouslyAllowLocalIP,
    deviceSizes: [640, 750, 828, 1080, 1200, 1440],
    imageSizes: [88, 115, 168, 176, 230, 336],
    localPatterns: LOCAL_IMAGE_PATTERNS,
    qualities: [72],
    remotePatterns: imageSourcePolicy.remotePatterns
  },
  transpilePackages: ["@perth-gig-finder/shared"]
};

export default nextConfig;
