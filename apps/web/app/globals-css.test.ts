import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const globalCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function getRuleBody(selector: string, searchStart = 0): string {
  const ruleMarker = `${selector} {`;
  const lineStart = globalCss.indexOf(`\n${ruleMarker}`, searchStart);
  let ruleStart = -1;

  if (searchStart === 0 && globalCss.startsWith(ruleMarker)) {
    ruleStart = 0;
  } else if (lineStart >= 0) {
    ruleStart = lineStart + 1;
  }

  if (ruleStart < 0) {
    throw new Error(`Missing CSS rule: ${selector}`);
  }

  const bodyStart = globalCss.indexOf("{", ruleStart) + 1;
  let bodyEnd = -1;
  let depth = 1;

  for (let index = bodyStart; index < globalCss.length; index += 1) {
    if (globalCss[index] === "{") {
      depth += 1;
    } else if (globalCss[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        bodyEnd = index;
        break;
      }
    }
  }

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

  it("uses the venue popover surface for the calendar", () => {
    const calendarRule = getRuleBody(".day-calendar");
    const venuePopoverRule = getRuleBody(".venue-menu__popover");

    expect(calendarRule).toContain("background: var(--popover-bg);");
    expect(venuePopoverRule).toContain("background: var(--popover-bg);");
  });

  it("keeps date arrows transparent until hover or focus", () => {
    expect(globalCss).toMatch(
      /^\.day-browser__arrow \{[\s\S]*?background: transparent;/m,
    );
    expect(globalCss).toMatch(
      /\.day-browser__arrow:focus-visible,\s+\.day-browser__arrow\[data-keyboard-focus="true"\] \{\s+background: var\(--soft-fill\);\s+box-shadow: 0 0 0 2px var\(--control-focus-border\);\s+color: var\(--text\);/,
    );
    expect(globalCss).toContain("@media (hover: hover) and (pointer: fine)");
    expect(globalCss).toMatch(
      /\.day-browser__header:has\(> \.day-browser__arrow--previous:hover\)\s+\+ \.day-browser__header-cover\s+\.day-browser__arrow--previous/,
    );
    expect(globalCss).toMatch(
      /\.day-browser__header:has\(> \.day-browser__arrow--next:hover\)\s+\+ \.day-browser__header-cover\s+\.day-browser__arrow--next/,
    );
  });

  it("uses the same pressed scale for native and prepared button feedback", () => {
    const arrowRule = getRuleBody(".day-browser__arrow");
    const iconRule = getRuleBody(".day-browser__skip-track-icon");
    const releaseKeyframes = getRuleBody(
      "@keyframes day-browser-arrow-feedback-release",
    );
    const buttonPendingFeedbackRule = getRuleBody(
      `.day-browser__arrow:active:not(:disabled),
.day-browser__arrow[data-navigation-feedback="pending"][data-navigation-origin="button"]`,
    );
    const buttonPendingIconRule = getRuleBody(
      `.day-browser__arrow:active:not(:disabled) .day-browser__skip-track-icon,
.day-browser__arrow[data-navigation-feedback="pending"][data-navigation-origin="button"]
  .day-browser__skip-track-icon`,
    );
    const buttonAnimatingFeedbackRule = getRuleBody(
      `.day-browser__arrow[data-navigation-feedback="animating"][data-navigation-origin="button"]
  .day-browser__skip-track-icon`,
    );

    expect(arrowRule).toContain(
      "--day-browser-arrow-press-duration: 100ms;",
    );
    expect(iconRule).toContain(
      "transition: transform var(--day-browser-arrow-press-duration) ease;",
    );
    expect(buttonPendingFeedbackRule).toContain(
      "color: var(--subtle-text);",
    );
    expect(buttonPendingFeedbackRule).toContain("transform: none;");
    expect(buttonPendingFeedbackRule).not.toContain("background:");
    expect(buttonPendingIconRule).toContain("transform: scale(0.84);");
    expect(releaseKeyframes).toMatch(
      /from \{[\s\S]*?transform: scale\(0\.84\);/,
    );
    expect(releaseKeyframes).toMatch(
      /to \{[\s\S]*?transform: scale\(1\);/,
    );
    expect(buttonAnimatingFeedbackRule).toContain(
      "var(--day-browser-heading-duration) var(--day-browser-heading-easing) both;",
    );
  });

  it("uses one 100ms shrink, 40ms hold, and 100ms gesture timeline", () => {
    const gestureKeyframes = getRuleBody(
      "@keyframes day-browser-arrow-gesture-feedback",
    );
    const gestureAnimatingFeedbackRule = getRuleBody(
      `.day-browser__arrow[data-navigation-feedback="animating"][data-navigation-origin="gesture"]
  .day-browser__skip-track-icon`,
    );

    expect(gestureKeyframes).toMatch(
      /0% \{[\s\S]*?transform: scale\(1\);[\s\S]*?animation-timing-function: ease;/,
    );
    expect(gestureKeyframes).toMatch(
      /41\.6667% \{[\s\S]*?color: var\(--subtle-text\);[\s\S]*?transform: scale\(0\.84\);/,
    );
    expect(gestureKeyframes).toMatch(
      /58\.3333% \{[\s\S]*?transform: scale\(0\.84\);[\s\S]*?animation-timing-function: var\(--day-browser-heading-easing\);/,
    );
    expect(gestureKeyframes).toMatch(
      /100% \{[\s\S]*?transform: scale\(1\);/,
    );
    expect(gestureAnimatingFeedbackRule).toContain(
      "day-browser-arrow-gesture-feedback",
    );
    expect(gestureAnimatingFeedbackRule).toContain(
      "var(--day-browser-heading-duration) linear both;",
    );
    expect(gestureAnimatingFeedbackRule).not.toContain(
      "day-browser-arrow-feedback-release",
    );
    expect(globalCss).not.toContain(
      "--day-browser-arrow-gesture-release-duration",
    );
  });

  it("disables arrow motion under reduced motion", () => {
    const arrowStylesStart = globalCss.indexOf(".day-browser__arrow {");
    const reducedMotionRule = getRuleBody(
      "@media (prefers-reduced-motion: reduce)",
      arrowStylesStart,
    );

    expect(reducedMotionRule).toContain(
      "--day-browser-arrow-opacity-duration: 0ms;",
    );
    expect(reducedMotionRule).toMatch(
      /\.day-browser__arrow \.day-browser__skip-track-icon \{\s+transition: none;/,
    );
    expect(reducedMotionRule).toMatch(
      /\.day-browser__arrow\[data-navigation-feedback\]\s+\.day-browser__skip-track-icon \{\s+animation: none;/,
    );
  });

  it("smoothly transitions date arrow availability changes", () => {
    const arrowRule = getRuleBody(".day-browser__arrow");
    const disabledRule = getRuleBody(".day-browser__arrow:disabled");
    const unavailableRule = getRuleBody(
      `.day-browser__arrow[data-date-unavailable="true"]`,
    );

    expect(arrowRule).toContain(
      "--day-browser-arrow-opacity-duration: 160ms;",
    );
    expect(arrowRule).toContain(
      "opacity var(--day-browser-arrow-opacity-duration) ease;",
    );
    expect(disabledRule).toContain("cursor: default;");
    expect(disabledRule).not.toContain("opacity:");
    expect(unavailableRule).toContain("opacity: 0.35;");
  });
});
