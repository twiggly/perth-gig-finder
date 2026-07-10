import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const globalCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function getRuleBody(selector: string): string {
  const ruleStart = globalCss.indexOf(`${selector} {`);

  if (ruleStart < 0) {
    throw new Error(`Missing CSS rule: ${selector}`);
  }

  const bodyStart = globalCss.indexOf("{", ruleStart) + 1;
  const bodyEnd = globalCss.indexOf("}", bodyStart);

  if (bodyEnd < 0) {
    throw new Error(`Unclosed CSS rule: ${selector}`);
  }

  return globalCss.slice(bodyStart, bodyEnd);
}

describe("global CSS compatibility", () => {
  it("keeps both sticky backdrop declarations in prefix-first order", () => {
    const stickyBackdropRule = getRuleBody(".day-browser__header::before");

    expect(stickyBackdropRule).toMatch(
      /-webkit-backdrop-filter: blur\(14px\);\s+backdrop-filter: blur\(14px\);/,
    );
  });
});
