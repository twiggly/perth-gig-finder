export const CONTENT_ADDRESSED_GIG_IMAGE_EXTENSIONS = [
  "avif",
  "jpg",
  "png",
  "webp"
] as const;

export type ContentAddressedGigImageExtension =
  (typeof CONTENT_ADDRESSED_GIG_IMAGE_EXTENSIONS)[number];

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTENT_ADDRESSED_GIG_IMAGE_PATH_PATTERN =
  /^sha256\/([0-9a-f]{2})\/([0-9a-f]{64})\.(avif|jpg|png|webp)$/;

export function buildContentAddressedGigImagePath(input: {
  extension: ContentAddressedGigImageExtension;
  sha256: string;
}): string {
  if (!SHA256_PATTERN.test(input.sha256)) {
    throw new Error(
      "Content-addressed image hash must be 64 lowercase hex characters"
    );
  }

  if (!CONTENT_ADDRESSED_GIG_IMAGE_EXTENSIONS.includes(input.extension)) {
    throw new Error(
      `Unsupported content-addressed image extension: ${input.extension}`
    );
  }

  return `sha256/${input.sha256.slice(0, 2)}/${input.sha256}.${input.extension}`;
}

export function isContentAddressedGigImagePath(path: string): boolean {
  const match = CONTENT_ADDRESSED_GIG_IMAGE_PATH_PATTERN.exec(path);

  return Boolean(match && match[1] === match[2]?.slice(0, 2));
}
