import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { VenueOption } from "@/lib/venues";

import {
  HEADER_LOCATION_DISPLAY_NAME,
  HEADER_LOCATION_OPTIONS,
  HEADER_LOCATION_UNAVAILABLE_MARKER,
  getHeaderLocationOptionLabel,
  getHeaderLocationUnavailableMarker,
  isHeaderLocationAvailable,
  resolveHeaderLocationSelection,
  syncHeaderLocationMenuOpenState
} from "./header-location-select";
import { HomepageTopPanelControls } from "./homepage-top-panel-controls";
import { getHeaderMenuButtonStates } from "./site-header-menu";

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
  initialHeaderMenuState,
  initialFilterPanelVisible = false,
  selectedVenues = []
}: {
  currentQuery?: string;
  initialHeaderMenuState?: "closed" | "open" | "closing";
  initialFilterPanelVisible?: boolean;
  selectedVenues?: VenueOption[];
} = {}) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <HomepageTopPanelControls
        activeDateKey={null}
        availableDateKeys={["2099-01-01"]}
        currentQuery={currentQuery}
        initialHeaderMenuState={initialHeaderMenuState}
        initialFilterPanelVisible={initialFilterPanelVisible}
        selectedVenues={selectedVenues}
      />
    </MantineProvider>
  );
}

function getButtonOpeningTags(html: string, className: string) {
  return (html.match(/<button\b[^>]*>/g) ?? []).filter((tag) =>
    tag.includes(className)
  );
}

describe("HomepageTopPanelControls", () => {
  it("syncs the header location menu body blur state", () => {
    const targetDocument = {
      body: {
        dataset: {
          headerLocationMenuOpen: undefined as string | undefined
        }
      }
    };

    syncHeaderLocationMenuOpenState(true, targetDocument);
    expect(targetDocument.body.dataset.headerLocationMenuOpen).toBe("true");

    syncHeaderLocationMenuOpenState(false, targetDocument);
    expect(targetDocument.body.dataset).not.toHaveProperty(
      "headerLocationMenuOpen"
    );
  });

  it("renders the closed panel/date-row filter toggle alongside the hidden header placement", () => {
    const html = renderControls();
    const filterToggles = getButtonOpeningTags(
      html,
      "site-header__filter-toggle"
    );
    const headerToggle = filterToggles.find((button) =>
      button.includes("site-header__filter-toggle--header")
    );
    const panelToggle = filterToggles.find((button) =>
      button.includes("site-header__filter-toggle--panel")
    );
    const menuButton = html.match(
      /<button[^>]*class="[^"]*site-header__menu-button[^"]*"[^>]*>/
    )?.[0];
    const headerTogglePanelId =
      headerToggle?.match(/aria-controls="([^"]+)"/)?.[1];
    const panelTogglePanelId =
      panelToggle?.match(/aria-controls="([^"]+)"/)?.[1];
    const menuOverlayId = menuButton?.match(/aria-controls="([^"]+)"/)?.[1];
    const locationIndex = html.indexOf("site-header__location");
    const iconGroupIndex = html.indexOf("site-header__action-icons");
    const headerFilterToggleIndex = html.indexOf(
      "site-header__filter-toggle--header"
    );
    const panelFilterToggleIndex = html.indexOf(
      "site-header__filter-toggle--panel"
    );
    const profileIndex = html.indexOf("site-header__profile");
    const menuIndex = html.indexOf("site-header__menu-button");
    const menuOverlayIndex = html.indexOf("site-header__menu-overlay");
    const filtersLayoutIndex = html.indexOf("top-panel__filters-layout");
    const shortcutRowIndex = html.indexOf("date-shortcut-row");
    const filterToggleMatches =
      html.match(/site-header__filter-toggle--homepage/g) ?? [];
    const menuItemMarkerMatches =
      html.match(/site-header__menu-item-marker/g) ?? [];

    expect(html).toContain("site-header__actions");
    expect(html).toContain("site-header__action-icons");
    expect(html).not.toContain("site-header__action-secondary");
    expect(html).toContain('class="site-header__location"');
    expect(locationIndex).toBeGreaterThan(-1);
    expect(locationIndex).toBeGreaterThan(iconGroupIndex);
    expect(headerFilterToggleIndex).toBeGreaterThan(locationIndex);
    expect(menuIndex).toBeGreaterThan(headerFilterToggleIndex);
    expect(menuOverlayIndex).toBeGreaterThan(menuIndex);
    expect(filtersLayoutIndex).toBeGreaterThan(menuOverlayIndex);
    expect(shortcutRowIndex).toBeGreaterThan(filtersLayoutIndex);
    expect(panelFilterToggleIndex).toBeGreaterThan(shortcutRowIndex);
    expect(filterToggleMatches).toHaveLength(2);
    expect(profileIndex).toBe(-1);
    expect(headerToggle).toContain("site-header__filter-toggle--homepage");
    expect(headerToggle).toContain("site-header__filter-toggle--header");
    expect(panelToggle).toContain("site-header__filter-toggle--homepage");
    expect(panelToggle).toContain("site-header__filter-toggle--panel");
    expect(menuButton).toContain('aria-label="Open account menu"');
    expect(menuButton).toContain('aria-expanded="false"');
    expect(menuButton).toContain('data-state="closed"');
    expect(menuButton).toContain('data-surface-state="closed"');
    expect(menuOverlayId).toBeTruthy();
    expect(html).toContain("site-header__menu-icon-stack");
    expect(html).toContain("site-header__menu-icon--lines");
    expect(html).toContain("site-header__menu-icon--close");
    expect(html).toContain("M6 9h12M6 15h12");
    expect(html).toContain("M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5");
    expect(html).toContain(`id="${menuOverlayId}"`);
    expect(html).toContain("site-header__menu-overlay");
    expect(html).toContain('data-state="closed"');
    expect(html).toContain("site-header__menu-overlay-content");
    expect(html).toContain("Account");
    expect(html).toContain("Log in");
    expect(html).not.toContain("Sign In");
    expect(html).toContain("Sign up");
    expect(html).toContain("Resources");
    expect(html).toContain("About");
    expect(html).toContain("Contact");
    expect(menuItemMarkerMatches).toHaveLength(4);
    expect(html).toContain("site-header__location-text");
    expect(html).toContain("Perth");
    expect(html).toContain("Boorloo");
    expect(html).toContain(HEADER_LOCATION_DISPLAY_NAME);
    expect(html).toContain("site-header__location-name");
    expect(html).toContain("site-header__location-name-word--perth");
    expect(html).toContain("site-header__location-name-word--boorloo");
    expect(html).toContain("site-header__location-static-name");
    expect(html).toContain("site-header__location-measurements");
    expect(html).toContain("site-header__location-measurement");
    expect(html).toContain("site-header__location-chevron");
    expect(html).toContain("M5.5 7.75 10 12.25l4.5-4.5");
    expect(html).toContain(`aria-label="Choose city: ${HEADER_LOCATION_DISPLAY_NAME}"`);
    expect(html).toContain(`title="Choose city: ${HEADER_LOCATION_DISPLAY_NAME}"`);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(headerToggle).toContain('aria-expanded="false"');
    expect(headerToggle).toContain(
      'aria-label="Show search and venue filters"'
    );
    expect(headerToggle).toContain('data-state="closed"');
    expect(panelToggle).toContain('aria-expanded="false"');
    expect(panelToggle).toContain('aria-label="Show search and venue filters"');
    expect(panelToggle).toContain('data-state="closed"');
    expect(html).toContain('data-filter-panel-visible="false"');
    expect(headerTogglePanelId).toBeTruthy();
    expect(panelTogglePanelId).toBe(headerTogglePanelId);
    expect(html).toContain(`id="${headerTogglePanelId}"`);
    expect(html).toContain('hidden=""');
    expect(html).toContain("site-header__filter-icon-stack");
    expect(html).toContain("site-header__filter-icon--search");
    expect(html).toContain("site-header__filter-icon--close");
    expect(html).not.toContain('aria-label="Toggle color scheme"');
    expect(html).not.toContain('aria-label="Open account information"');
  });

  it("derives stable menu button and overlay states", () => {
    expect(getHeaderMenuButtonStates("closed")).toEqual({
      ariaOpen: false,
      iconState: "closed",
      isOverlayMounted: false,
      surfaceState: "closed"
    });
    expect(getHeaderMenuButtonStates("open")).toEqual({
      ariaOpen: true,
      iconState: "open",
      isOverlayMounted: true,
      surfaceState: "open"
    });
    expect(getHeaderMenuButtonStates("closing")).toEqual({
      ariaOpen: false,
      iconState: "closed",
      isOverlayMounted: true,
      surfaceState: "open"
    });
  });

  it("can render the menu overlay in the open animation state", () => {
    const html = renderControls({ initialHeaderMenuState: "open" });
    const menuButton = html.match(
      /<button[^>]*class="[^"]*site-header__menu-button[^"]*"[^>]*>/
    )?.[0];
    const overlay = html.match(
      /<div[^>]*class="site-header__menu-overlay"[^>]*>/
    )?.[0];

    expect(menuButton).toContain('aria-label="Close account menu"');
    expect(menuButton).toContain('aria-expanded="true"');
    expect(menuButton).toContain('data-state="open"');
    expect(menuButton).toContain('data-surface-state="open"');
    expect(overlay).toContain('aria-hidden="false"');
    expect(overlay).toContain('data-state="open"');
    expect(overlay).not.toContain(' hidden=""');
  });

  it("can render the menu overlay in the closing animation state", () => {
    const html = renderControls({ initialHeaderMenuState: "closing" });
    const menuButton = html.match(
      /<button[^>]*class="[^"]*site-header__menu-button[^"]*"[^>]*>/
    )?.[0];
    const overlay = html.match(
      /<div[^>]*class="site-header__menu-overlay"[^>]*>/
    )?.[0];

    expect(menuButton).toContain('aria-label="Open account menu"');
    expect(menuButton).toContain('aria-expanded="false"');
    expect(menuButton).toContain('data-state="closed"');
    expect(menuButton).toContain('data-surface-state="open"');
    expect(overlay).toContain('aria-hidden="true"');
    expect(overlay).toContain('data-state="closing"');
    expect(overlay).not.toContain(' hidden=""');
  });

  it("renders the same filter toggle open with cross state", () => {
    const html = renderControls({ initialFilterPanelVisible: true });
    const filterToggles = getButtonOpeningTags(
      html,
      "site-header__filter-toggle"
    );
    const headerToggle = filterToggles.find((button) =>
      button.includes("site-header__filter-toggle--header")
    );
    const panelToggle = filterToggles.find((button) =>
      button.includes("site-header__filter-toggle--panel")
    );
    const filtersLayoutIndex = html.indexOf("top-panel__filters-layout");
    const filterToolbarIndex = html.indexOf("filter-toolbar");
    const panelToggleIndex = html.indexOf("site-header__filter-toggle--panel");
    const togglePanelId = panelToggle?.match(/aria-controls="([^"]+)"/)?.[1];
    const filterToggleMatches =
      html.match(/site-header__filter-toggle--homepage/g) ?? [];

    expect(filtersLayoutIndex).toBeGreaterThan(-1);
    expect(filterToolbarIndex).toBeGreaterThan(filtersLayoutIndex);
    expect(panelToggleIndex).toBeGreaterThan(filterToolbarIndex);
    expect(filterToggleMatches).toHaveLength(2);
    expect(headerToggle).toContain("site-header__filter-toggle--homepage");
    expect(headerToggle).toContain("site-header__filter-toggle--header");
    expect(headerToggle).toContain('aria-expanded="true"');
    expect(headerToggle).toContain('aria-label="Hide search and venue filters"');
    expect(headerToggle).toContain('data-state="open"');
    expect(panelToggle).toContain("site-header__filter-toggle--homepage");
    expect(panelToggle).toContain("site-header__filter-toggle--panel");
    expect(panelToggle).toContain('aria-expanded="true"');
    expect(panelToggle).toContain('aria-label="Hide search and venue filters"');
    expect(panelToggle).toContain('data-state="open"');
    expect(html).toContain('data-filter-panel-visible="true"');
    expect(togglePanelId).toBeTruthy();
    expect(html).toContain(`id="${togglePanelId}"`);
    expect(html).toContain("site-header__filter-icon-stack");
    expect(html).toContain("site-header__filter-icon--search");
    expect(html).toContain("site-header__filter-icon--close");
    expect(html).toContain("M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5");
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
    expect(html.match(/data-active-filters="true"/g)).toHaveLength(2);
  });

  it("does not mark the open filter toggle when active filters are visible", () => {
    const html = renderControls({
      initialFilterPanelVisible: true,
      selectedVenues: [
        {
          name: "201 BELOW",
          slug: "201-below",
          suburb: "North Fremantle"
        }
      ]
    });
    const toggles = getButtonOpeningTags(html, "site-header__filter-toggle");

    expect(toggles).toHaveLength(2);
    for (const toggle of toggles) {
      expect(toggle).toContain('aria-expanded="true"');
      expect(toggle).toContain('data-state="open"');
      expect(toggle).not.toContain('data-active-filters="true"');
    }
    expect(html).toContain("site-header__filter-icon--close");
  });

  it("uses the supported homepage city options", () => {
    expect(HEADER_LOCATION_OPTIONS).toEqual([
      "Perth",
      "Sydney",
      "Melbourne",
      "Brisbane",
      "Adelaide",
      "Canberra"
    ]);
  });

  it("uses a Boorloo-aware display label for Perth", () => {
    expect(getHeaderLocationOptionLabel("Perth")).toBe(
      HEADER_LOCATION_DISPLAY_NAME
    );
    expect(getHeaderLocationOptionLabel("Sydney")).toBe("Sydney");
  });

  it("marks only non-Perth city options as unavailable", () => {
    expect(HEADER_LOCATION_OPTIONS.filter(isHeaderLocationAvailable)).toEqual([
      "Perth"
    ]);
    expect(getHeaderLocationUnavailableMarker("Perth")).toBeNull();

    for (const location of HEADER_LOCATION_OPTIONS.filter(
      (option) => option !== "Perth"
    )) {
      expect(isHeaderLocationAvailable(location)).toBe(false);
      expect(getHeaderLocationUnavailableMarker(location)).toBe(
        HEADER_LOCATION_UNAVAILABLE_MARKER
      );
    }
  });

  it("guards unavailable city selections", () => {
    expect(resolveHeaderLocationSelection("Perth")).toBe("Perth");
    expect(resolveHeaderLocationSelection("Sydney")).toBeNull();
    expect(resolveHeaderLocationSelection("Canberra")).toBeNull();
    expect(resolveHeaderLocationSelection("Not a city")).toBeNull();
  });
});
