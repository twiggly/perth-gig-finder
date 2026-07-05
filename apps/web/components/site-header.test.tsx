import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";

import { SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    replace: vi.fn()
  })
}));

function renderWithMantine(element: React.ReactElement) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      {element}
    </MantineProvider>
  );
}

describe("SiteHeader", () => {
  it("renders the shared brand header without actions by default", () => {
    const html = renderWithMantine(<SiteHeader />);

    expect(html).toContain("site-header-shell");
    expect(html).toContain("Gig Radar");
    expect(html).toContain("site-header__eyebrow");
    expect(html).toContain('aria-label="Perth and Boorloo Live Music"');
    expect(html).not.toContain("Toggle color scheme");
    expect(html).not.toContain("Open account information");
  });

  it("renders public menu actions when requested", () => {
    const html = renderWithMantine(
      <SiteHeader actions="public-menu" className="site-header-shell--detail" />
    );

    expect(html).toContain("site-header-shell--detail");
    expect(html).toContain("Gig Radar");
    expect(html).toContain("site-header__eyebrow");
    expect(html).not.toContain("Toggle color scheme");
    expect(html).toContain('aria-label="Choose city: Perth / Boorloo"');
    expect(html).toContain("site-header__location");
    expect(html).toContain('aria-label="Open account menu"');
    expect(html).toContain("site-header__menu-button");
    expect(html).toContain("site-header__menu-overlay");
    expect(html).not.toContain("Open account information");
    expect(html).not.toContain("site-header__filter-toggle");
  });
});
