const SUPPORTED_RANGES = [
  { major: 20, minMinor: 19, minPatch: 0, label: "20.19.0+" },
  { major: 22, minMinor: 12, minPatch: 0, label: "22.12.0+" },
  { major: 24, minMinor: 0, minPatch: 0, label: "24.x" },
];

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (!match) {
    return null;
  }

  const [, major, minor, patch] = match;

  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
  };
}

function isSupported(version) {
  return SUPPORTED_RANGES.some((range) => {
    if (version.major !== range.major) {
      return false;
    }

    if (version.minor > range.minMinor) {
      return true;
    }

    if (version.minor < range.minMinor) {
      return false;
    }

    return version.patch >= range.minPatch;
  });
}

const currentVersion = process.versions.node;
const parsedVersion = parseVersion(currentVersion);

if (!parsedVersion || !isSupported(parsedVersion)) {
  console.error("");
  console.error("Unsupported Node.js version for Perth Gig Finder.");
  console.error(`Current runtime: v${currentVersion}`);
  console.error(
    `Supported runtimes: ${SUPPORTED_RANGES.map((range) => range.label).join(", ")}`,
  );
  console.error("");
  console.error(
    "This repo currently targets even Node release lines only because the current toolchain",
  );
  console.error(
    "can fail inside Vite/Vitest on unsupported runtimes with errors like 'rollup/parseAst'.",
  );
  console.error("");
  console.error("Recommended fix:");
  console.error("  1. nvm use");
  console.error("     or pnpm env use --global 22.12.0");
  console.error("  2. pnpm install");
  console.error("  3. pnpm test");
  console.error("");
  process.exit(1);
}
