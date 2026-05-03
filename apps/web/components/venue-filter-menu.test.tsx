import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";
import type { VenueOption } from "@/lib/venues";

import { VenueFilterMenu } from "./venue-filter-menu";

const VENUES: VenueOption[] = [
  {
    name: "The Bird",
    slug: "the-bird",
    suburb: "Northbridge"
  },
  {
    name: "Mojos Bar",
    slug: "mojos-bar",
    suburb: "Fremantle"
  }
];

function renderVenueMenu({
  isOpen = false,
  isPending = false,
  isPhoneScrollbarDevice = false,
  suggestions = [],
  venueInput = ""
}: {
  isOpen?: boolean;
  isPending?: boolean;
  isPhoneScrollbarDevice?: boolean;
  suggestions?: VenueOption[];
  venueInput?: string;
} = {}) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <VenueFilterMenu
        isOpen={isOpen}
        isPending={isPending}
        isPhoneScrollbarDevice={isPhoneScrollbarDevice}
        menuId="venue-menu-test"
        onClose={() => {}}
        onInputChange={() => {}}
        onSelectVenue={() => {}}
        onTriggerClick={() => {}}
        suggestions={suggestions}
        venueInput={venueInput}
      />
    </MantineProvider>
  );
}

describe("VenueFilterMenu", () => {
  it("renders the closed Venues trigger", () => {
    const html = renderVenueMenu();

    expect(html).toContain("Venues");
    expect(html).toContain("venue-menu__trigger");
    expect(html).not.toContain("venue-menu__trigger--open");
    expect(html).toContain('aria-controls="venue-menu-test"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).not.toContain("venue-menu__popover");
  });

  it("renders open venue options with Combobox options and suburb text", () => {
    const html = renderVenueMenu({
      isOpen: true,
      suggestions: VENUES,
      venueInput: "mojos"
    });

    expect(html).toContain("venue-menu__trigger--open");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("venue-menu__popover");
    expect(html).toContain(
      "width:min(var(--venue-menu-popover-width), calc(100vw - 1rem))"
    );
    expect(html).toContain('id="venue-menu-test"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('id="venue-filter-input"');
    expect(html).toContain('placeholder="Search venues"');
    expect(html).toContain('value="mojos"');
    expect(html).toContain("venue-menu__scroller");
    expect(html).toContain('aria-label="Venue options"');
    expect(html).toContain("data-combobox-option");
    expect(html).toContain("The Bird");
    expect(html).toContain("Northbridge");
    expect(html).toContain("Mojos Bar");
    expect(html).toContain("Fremantle");
    expect(html).toContain("venue-suggestion");
  });

  it("renders the loading state when suggestions are pending", () => {
    const html = renderVenueMenu({ isOpen: true, isPending: true });

    expect(html).toContain("Loading venues…");
    expect(html).not.toContain("No matching venues yet.");
  });

  it("renders the empty state when no venues match", () => {
    const html = renderVenueMenu({ isOpen: true });

    expect(html).toContain("No matching venues yet.");
    expect(html).not.toContain("Loading venues…");
  });

  it("renders the phone scrollbar variant with the venue list intact", () => {
    const html = renderVenueMenu({
      isOpen: true,
      isPhoneScrollbarDevice: true,
      suggestions: VENUES
    });

    expect(html).toContain("venue-menu__scroller");
    expect(html).toContain("The Bird");
    expect(html).toContain("Mojos Bar");
  });
});
