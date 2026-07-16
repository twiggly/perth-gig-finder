import "dotenv/config";

import { pathToFileURL } from "node:url";

import { enrichTixelLinks } from "./tixel-enrichment";
import { SupabaseTixelEnrichmentStore } from "./tixel-enrichment/store";

export async function main(): Promise<void> {
  const summary = await enrichTixelLinks(new SupabaseTixelEnrichmentStore());
  console.error(`[tixel-enrichment] ${JSON.stringify(summary)}`);
  console.log(JSON.stringify(summary, null, 2));
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void main();
}
