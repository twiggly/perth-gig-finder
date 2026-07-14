import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { normalizeAbsoluteHttpUrl } from "@perth-gig-finder/shared";

import { IMAGE_MIRROR_MAX_REDIRECTS } from "./constants";

export type ImageHostResolver = (
  hostname: string
) => Promise<readonly string[]>;

interface SafeImageUrlResult {
  errorMessage: string | null;
  url: string | null;
}

function stripIpBrackets(value: string): string {
  return value.replace(/^\[/, "").replace(/\]$/, "");
}

function isLocalhostHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

function parseIpv4Address(
  address: string
): [number, number, number, number] | null {
  const parts = address.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));

  if (
    octets.some(
      (octet, index) =>
        !/^\d+$/.test(parts[index] ?? "") ||
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255
    )
  ) {
    return null;
  }

  return octets as [number, number, number, number];
}

export function isUnsafeImageIpAddress(address: string): boolean {
  const normalized = stripIpBrackets(address).toLowerCase();
  const mappedIpv4Match = normalized.includes(":")
    ? normalized.match(/(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
    : null;

  if (mappedIpv4Match) {
    return isUnsafeImageIpAddress(mappedIpv4Match[1]!);
  }

  if (isIP(normalized) === 4) {
    const octets = parseIpv4Address(normalized);

    if (!octets) {
      return true;
    }

    const [first, second, third] = octets;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 88 && third === 99) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113)
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized === "0:0:0:0:0:0:0:0" ||
      normalized === "0:0:0:0:0:0:0:1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:") ||
      normalized === "2001:db8::" ||
      normalized.startsWith("2001:0db8:") ||
      normalized.startsWith("2001:10:") ||
      normalized.startsWith("2001:0010:") ||
      normalized.startsWith("2002:")
    );
  }

  return true;
}

export async function defaultResolveImageHostname(
  hostname: string
): Promise<readonly string[]> {
  const records = await lookup(hostname, {
    all: true,
    verbatim: true
  });

  return records.map((record) => record.address);
}

async function validateImageRequestUrl(input: {
  resolveHostname: ImageHostResolver;
  url: string;
}): Promise<SafeImageUrlResult> {
  const normalizedUrl = normalizeAbsoluteHttpUrl(input.url);

  if (!normalizedUrl) {
    return {
      errorMessage: "Unsupported image URL",
      url: null
    };
  }

  const parsedUrl = new URL(normalizedUrl);
  const hostname = stripIpBrackets(parsedUrl.hostname).toLowerCase();

  if (isLocalhostHostname(hostname)) {
    return {
      errorMessage: "Unsafe image host",
      url: null
    };
  }

  let resolvedAddresses: readonly string[];

  try {
    resolvedAddresses =
      isIP(hostname) === 0 ? await input.resolveHostname(hostname) : [hostname];
  } catch {
    return {
      errorMessage: "Unable to resolve image host",
      url: null
    };
  }

  if (resolvedAddresses.length === 0) {
    return {
      errorMessage: "Unable to resolve image host",
      url: null
    };
  }

  if (resolvedAddresses.some((address) => isUnsafeImageIpAddress(address))) {
    return {
      errorMessage: "Unsafe image host",
      url: null
    };
  }

  return {
    errorMessage: null,
    url: normalizedUrl
  };
}

export async function fetchImageWithRedirects(input: {
  fetchImpl: typeof fetch;
  resolveHostname: ImageHostResolver;
  signal: AbortSignal;
  url: string;
}): Promise<{ errorMessage: string | null; response: Response | null }> {
  let currentUrl = input.url;

  for (
    let redirectCount = 0;
    redirectCount <= IMAGE_MIRROR_MAX_REDIRECTS;
    redirectCount += 1
  ) {
    const safeUrl = await validateImageRequestUrl({
      resolveHostname: input.resolveHostname,
      url: currentUrl
    });

    if (!safeUrl.url) {
      return {
        errorMessage: safeUrl.errorMessage,
        response: null
      };
    }

    const response = await input.fetchImpl(safeUrl.url, {
      redirect: "manual",
      signal: input.signal
    });

    if (response.status < 300 || response.status >= 400) {
      return {
        errorMessage: null,
        response
      };
    }

    if (redirectCount >= IMAGE_MIRROR_MAX_REDIRECTS) {
      return {
        errorMessage: "Image request exceeded redirect limit",
        response: null
      };
    }

    const location = response.headers.get("location");

    if (!location) {
      return {
        errorMessage: "Image redirect missing location",
        response: null
      };
    }

    try {
      currentUrl = new URL(location, safeUrl.url).toString();
    } catch {
      return {
        errorMessage: "Image redirect location is invalid",
        response: null
      };
    }
  }

  return {
    errorMessage: "Image request exceeded redirect limit",
    response: null
  };
}
