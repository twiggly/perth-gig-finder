import { describe, expect, it } from "vitest";

import {
  APP_COLOR_SCHEME_STORAGE_KEY,
  DEFAULT_APP_COLOR_SCHEME,
  getAppColorSchemeScript,
  getAppFirstPaintBackgroundStyle,
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

describe("default color scheme", () => {
  it("keeps server fallback aligned to the dark app default", () => {
    expect(DEFAULT_APP_COLOR_SCHEME).toBe("dark");
  });
});

describe("getAppFirstPaintBackgroundStyle", () => {
  it("sets a dark first-paint background for html and body", () => {
    const style = getAppFirstPaintBackgroundStyle();

    expect(style).toContain("html{background-color:#121018;color-scheme:dark;}");
    expect(style).toContain("body{background-color:#121018;}");
  });

  it("includes a light-scheme override for saved light preferences", () => {
    const style = getAppFirstPaintBackgroundStyle();

    expect(style).toContain('html[data-mantine-color-scheme="light"]');
    expect(style).toContain("color-scheme:light");
    expect(style).toContain(
      'html[data-mantine-color-scheme="light"] body{background-color:rgb(241,239,233);}'
    );
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
