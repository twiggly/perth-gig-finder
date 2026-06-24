import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { VenueOption } from "@/lib/venues";

import { HomepageTopPanelControls } from "./homepage-top-panel-controls";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    prefetch: () => {},
    push: () => {},
    replace: () => {}
  })
}));

function renderControls({
  currentQuery = "",
  selectedVenues = []
}: {
  currentQuery?: string;
  selectedVenues?: VenueOption[];
} = {}) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <HomepageTopPanelControls
        activeDateKey={null}
        availableDateKeys={["2099-01-01"]}
        currentQuery={currentQuery}
        selectedVenues={selectedVenues}
      />
    </MantineProvider>
  );
}

describe("HomepageTopPanelControls", () => {
  it("renders the filter toggle with the header actions", () => {
    const html = renderControls();
    const toggle = html.match(
      /<button[^>]*class="site-header__filter-toggle"[^>]*>/
    )?.[0];
    const togglePanelId = toggle?.match(/aria-controls="([^"]+)"/)?.[1];

    expect(html).toContain("site-header__actions");
    expect(toggle).toContain('aria-expanded="false"');
    expect(toggle).toContain('aria-label="Show search and venue filters"');
    expect(togglePanelId).toBeTruthy();
    expect(html).toContain(`id="${togglePanelId}"`);
    expect(html).toContain('hidden=""');
    expect(html).not.toContain('aria-label="Toggle color scheme"');
    expect(html).toContain('aria-label="Open account information"');
  });

  it("marks the filter toggle when filters are active", () => {
    const html = renderControls({
      currentQuery: "spacey jane",
      selectedVenues: [
        {
          name: "The Bird",
          slug: "the-bird",
          suburb: "Northbridge"
        }
      ]
    });

    expect(html).toContain("site-header__filter-toggle");
    expect(html).toContain('data-active-filters="true"');
  });
});
