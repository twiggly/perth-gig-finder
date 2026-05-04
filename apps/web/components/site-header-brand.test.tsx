import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteHeaderBrand } from "./site-header-brand";

describe("SiteHeaderBrand", () => {
  it("renders the Gig Radar heading with the logo mark", () => {
    const html = renderToStaticMarkup(<SiteHeaderBrand />);

    expect(html).toContain("Gig Radar");
    expect(html).toContain("site-header__logo-mark");
    expect(html).toContain('src="/logo.svg"');
    expect(html).toContain('alt=""');
    expect(html).toContain("site-header__title-text");
  });
});
