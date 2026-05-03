import { describe, expect, it } from "vitest";

import {
  APP_COLOR_SCHEME_STORAGE_KEY,
  getAppColorSchemeScript,
  normalizeAppColorScheme
} from "./color-scheme";

describe("normalizeAppColorScheme", () => {
  it("preserves explicit color schemes", () => {
    expect(normalizeAppColorScheme("dark")).toBe("dark");
    expect(normalizeAppColorScheme("light")).toBe("light");
  });

  it("falls back to dark for auto, invalid, missing, or inaccessible values", () => {
    expect(normalizeAppColorScheme("auto")).toBe("dark");
    expect(normalizeAppColorScheme("system")).toBe("dark");
    expect(normalizeAppColorScheme(null)).toBe("dark");
    expect(normalizeAppColorScheme(undefined)).toBe("dark");
  });
});

describe("getAppColorSchemeScript", () => {
  it("sets an explicit color scheme without reading system preference", () => {
    const script = getAppColorSchemeScript();

    expect(script).toContain(APP_COLOR_SCHEME_STORAGE_KEY);
    expect(script).toContain("data-mantine-color-scheme");
    expect(script).not.toContain("prefers-color-scheme");
    expect(script).not.toContain("matchMedia");
  });
});
