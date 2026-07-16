import React from "react";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";

import {
  HEADER_LOCATION_DISPLAY_NAME,
  HEADER_LOCATION_OPTIONS,
  HEADER_LOCATION_UNAVAILABLE_MARKER,
  HeaderLocationSelect,
  getHeaderLocationOptionLabel,
  getHeaderLocationUnavailableMarker,
  isHeaderLocationAvailable,
  resolveHeaderLocationSelection,
  syncHeaderLocationMenuOpenState
} from "./header-location-select";

function renderLocationSelect() {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <HeaderLocationSelect />
    </MantineProvider>
  );
}

describe("HeaderLocationSelect", () => {
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

  it("renders the closed animated Perth/Boorloo selector", () => {
    const html = renderLocationSelect();

    expect(html).toContain('class="site-header__location"');
    expect(html).toContain(`aria-label="Choose city: ${HEADER_LOCATION_DISPLAY_NAME}"`);
    expect(html).toContain(`title="Choose city: ${HEADER_LOCATION_DISPLAY_NAME}"`);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("site-header__location-text");
    expect(html).toContain("site-header__location-name-word--perth");
    expect(html).toContain("site-header__location-name-word--boorloo");
    expect(html).toContain("site-header__location-static-name");
    expect(html).toContain("site-header__location-measurements");
    expect(html).toContain(
      '<span aria-hidden="true" class="site-header__location-chevron">',
    );
    expect(html).toContain('class="site-header__location-chevron-icon"');
    expect(html).toContain("M5.5 7.75 10 12.25l4.5-4.5");
  });

  it("uses supported city labels and guards unavailable selections", () => {
    expect(HEADER_LOCATION_OPTIONS).toEqual([
      "Perth",
      "Sydney",
      "Melbourne",
      "Brisbane",
      "Adelaide",
      "Canberra"
    ]);
    expect(getHeaderLocationOptionLabel("Perth")).toBe(
      HEADER_LOCATION_DISPLAY_NAME
    );
    expect(getHeaderLocationOptionLabel("Sydney")).toBe("Sydney");
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

    expect(resolveHeaderLocationSelection("Perth")).toBe("Perth");
    expect(resolveHeaderLocationSelection("Sydney")).toBeNull();
    expect(resolveHeaderLocationSelection("Canberra")).toBeNull();
    expect(resolveHeaderLocationSelection("Not a city")).toBeNull();
  });
});
