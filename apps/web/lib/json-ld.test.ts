import { describe, expect, it } from "vitest";

import { serializeJsonLd } from "./json-ld";

describe("serializeJsonLd", () => {
  it("escapes script-breaking less-than characters while preserving values", () => {
    const value = {
      description: "</script><script>alert('xss')</script>",
      name: "Gig < Radar"
    };
    const serialized = serializeJsonLd(value);

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script");
    expect(JSON.parse(serialized)).toEqual(value);
  });

  it("escapes U+2028 and U+2029 while preserving parsed values", () => {
    const value = {
      text: "line separator:\u2028 paragraph separator:\u2029"
    };
    const serialized = serializeJsonLd(value);

    expect(serialized).toContain("\\u2028");
    expect(serialized).toContain("\\u2029");
    expect(serialized).not.toContain("\u2028");
    expect(serialized).not.toContain("\u2029");
    expect(JSON.parse(serialized)).toEqual(value);
  });
});
