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

  it("reduces menu item typography only above the phone breakpoint", () => {
    expect(globalCss).toMatch(
      /\.site-header__menu-item \{\s+color: var\(--text\);\s+font-size: clamp\(2\.1rem, 9vw, 4\.8rem\);/,
    );
    expect(globalCss).toMatch(
      /@media \(min-width: 721px\) \{\s+\.site-header__menu-item \{\s+font-size: clamp\(2\.5rem, 4vw, 3\.4rem\);\s+\}\s+\}/,
    );
  });

  it("reduces the brand title only at the desktop breakpoint", () => {
    const baseTitleRule = getRuleBody(".site-header__title");

    expect(baseTitleRule).toContain(
      "font-size: clamp(2rem, 5vw, 4rem);",
    );
    expect(globalCss).toMatch(
      /@media \(min-width: 960px\) \{[\s\S]*?\.site-header__title \{\s+font-size: clamp\(1\.85rem, 3vw, 2\.65rem\);\s+\}/,
    );
  });
});
