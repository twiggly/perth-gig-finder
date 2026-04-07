import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const productionDistDir = path.join(scriptDir, "..", "apps", "web", ".next-prod");

rmSync(productionDistDir, { force: true, recursive: true });
