import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteHeaderEyebrow } from "./site-header-eyebrow";

describe("SiteHeaderEyebrow", () => {
  it("renders the animated label and measurement text", () => {
    const html = renderToStaticMarkup(<SiteHeaderEyebrow />);

    expect(html).toContain('aria-label="Perth and Boorloo Live Music"');
    expect(html).toContain("site-header__eyebrow-location");
    expect(html).toContain("site-header__eyebrow-word--perth");
    expect(html).toContain("site-header__eyebrow-word--boorloo");
    expect(html).toContain(">Live<");
    expect(html).toContain(">Music<");
    expect(html).not.toContain(">Live Music<");
    expect(html).toContain("site-header__eyebrow-measurements");
    expect(html).toContain("site-header__eyebrow-measurement");
    expect(
      html.match(/class="site-header__eyebrow-measurement"/g)?.length
    ).toBe(2);
  });
});
