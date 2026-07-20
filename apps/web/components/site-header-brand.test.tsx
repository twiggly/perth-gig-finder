import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SiteHeaderBrand } from "./site-header-brand";
import { shouldResetHomepageBrandNavigation } from "./site-header-brand-link";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    replace: vi.fn()
  })
}));

function createClickEvent(
  overrides: Partial<Parameters<typeof shouldResetHomepageBrandNavigation>[1]> = {}
): Parameters<typeof shouldResetHomepageBrandNavigation>[1] {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
    ...overrides
  };
}

describe("SiteHeaderBrand", () => {
  it("renders the Gig Radar brand as the page heading by default", () => {
    const html = renderToStaticMarkup(<SiteHeaderBrand />);

    expect(html).toContain('<a class="site-header__brand-link" href="/">');
    expect(html).toContain("Gig Radar");
    expect(html).not.toContain("site-header__location");
    expect(html).not.toContain("Perth");
    expect(html).not.toContain("site-header__location-chevron");
    expect(html).toContain("site-header__logo-mark");
    expect(html).toContain('src="/logo.svg"');
    expect(html).toContain('alt=""');
    expect(html).toContain('<link rel="preload" as="image" href="/logo.svg"');
    expect(html).toContain("site-header__title-text");
    expect(html).toContain('<h1 class="site-header__title">');
  });

  it("can render without claiming the page heading", () => {
    const html = renderToStaticMarkup(<SiteHeaderBrand asHeading={false} />);

    expect(html).toContain('<span class="site-header__title">');
    expect(html).toContain("Gig Radar");
    expect(html).not.toContain("<h1");
  });

  it("intercepts plain homepage clicks to reset the homepage state", () => {
    expect(
      shouldResetHomepageBrandNavigation("/", createClickEvent())
    ).toBe(true);
  });

  it("keeps detail-page and modified clicks as normal link navigation", () => {
    expect(
      shouldResetHomepageBrandNavigation(
        "/gigs/example",
        createClickEvent()
      )
    ).toBe(false);
    expect(
      shouldResetHomepageBrandNavigation("/", createClickEvent({ metaKey: true }))
    ).toBe(false);
    expect(
      shouldResetHomepageBrandNavigation("/", createClickEvent({ button: 1 }))
    ).toBe(false);
  });
});
