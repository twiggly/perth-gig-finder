import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";
import type { VenueOption } from "@/lib/venues";

import { SelectedVenueChips } from "./selected-venue-chips";

function renderChips(venues: VenueOption[]) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <SelectedVenueChips
        onClearVenues={() => {}}
        onRemoveVenue={() => {}}
        venues={venues}
      />
    </MantineProvider>
  );
}

describe("SelectedVenueChips", () => {
  it("renders selected venue names and remove labels", () => {
    const html = renderChips([
      {
        name: "The Bird",
        slug: "the-bird",
        suburb: "Northbridge"
      }
    ]);

    expect(html).toContain('aria-label="Selected venues"');
    expect(html).toContain("The Bird");
    expect(html).toContain("Remove The Bird · Northbridge");
    expect(html).not.toContain("Clear all venues");
  });

  it("renders clear all only for multiple venues", () => {
    const html = renderChips([
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
    ]);

    expect(html).toContain("The Bird");
    expect(html).toContain("Mojos Bar");
    expect(html).toContain("Clear all venues");
  });

  it("renders no markup for an empty venue list", () => {
    const html = renderToStaticMarkup(
      <SelectedVenueChips
        onClearVenues={() => {}}
        onRemoveVenue={() => {}}
        venues={[]}
      />
    );

    expect(html).toBe("");
  });
});
