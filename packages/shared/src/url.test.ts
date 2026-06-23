import { describe, expect, it } from "vitest";

import { normalizeAbsoluteHttpUrl } from "./url";

describe("normalizeAbsoluteHttpUrl", () => {
  it("normalizes absolute http and https URLs", () => {
    expect(normalizeAbsoluteHttpUrl(" https://Example.com/path?q=1 ")).toBe(
      "https://example.com/path?q=1"
    );
    expect(normalizeAbsoluteHttpUrl("http://example.com")).toBe(
      "http://example.com/"
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "/relative/path",
    "example.com/path",
    "not a url",
    ""
  ])("rejects non-absolute or unsupported URLs: %s", (value) => {
    expect(normalizeAbsoluteHttpUrl(value)).toBeNull();
  });

  it.each([
    "https://user@example.com/",
    "https://user:pass@example.com/",
    "http://:pass@example.com/"
  ])("rejects URLs with credentials: %s", (value) => {
    expect(normalizeAbsoluteHttpUrl(value)).toBeNull();
  });

  it("handles nullish values", () => {
    expect(normalizeAbsoluteHttpUrl(null)).toBeNull();
    expect(normalizeAbsoluteHttpUrl(undefined)).toBeNull();
  });
});
