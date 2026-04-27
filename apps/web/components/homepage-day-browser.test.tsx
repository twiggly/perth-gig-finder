import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { DateGroup } from "@/lib/homepage-dates";
import type { GigCardRecord } from "@/lib/gigs";

import { HomepageDayBrowser } from "./homepage-day-browser";

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
}));

function createGig(
  overrides: Partial<GigCardRecord> = {}
): GigCardRecord {
  return {
    id: "gig-1",
    slug: "gig-1",
    title: "ALT//THURSDAYS",
    starts_at: "2026-04-29T10:30:00.000Z",
    artist_names: ["Melanija"],
    image_path: null,
    source_image_url: null,
    image_width: null,
    image_height: null,
    image_version: null,
    ticket_url: "https://tickets.example.com",
    source_url: "https://source.example.com/gig-1",
    source_name: "The Bird",
    venue_slug: "the-bird",
    venue_name: "The Bird",
    venue_suburb: "Northbridge",
    venue_website_url: "https://www.williamstreetbird.com/",
    status: "active",
    ...overrides
  };
}

function renderBrowser(days: Array<DateGroup<GigCardRecord>>) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <HomepageDayBrowser
        availableDays={days.map((day) => ({
          dateKey: day.dateKey,
          heading: day.heading
        }))}
        currentQuery=""
        initialActiveDateKey={days[0]?.dateKey ?? "2026-04-29"}
        initialDays={
          days.length > 0
            ? days
            : [
                {
                  dateKey: "2026-04-29",
                  heading: "Wed, Apr 29th",
                  items: []
                }
              ]
        }
        selectedVenueSlugs={[]}
      />
    </MantineProvider>
  );
}

describe("HomepageDayBrowser", () => {
  it("renders the date heading as a calendar trigger", () => {
    const html = renderBrowser([
      {
        dateKey: "2026-04-29",
        heading: "Wed, Apr 29th",
        items: [createGig()]
      }
    ]);

    expect(html).toContain("Choose date, currently Wed, Apr 29th");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("day-browser__heading-button");
    expect(html).toContain("Wed, Apr 29th");
  });

  it("renders only the active day even when adjacent days are seeded", () => {
    const html = renderBrowser([
      {
        dateKey: "2026-04-29",
        heading: "Wed, Apr 29th",
        items: [createGig()]
      },
      {
        dateKey: "2026-04-30",
        heading: "Thu, Apr 30th",
        items: [
          createGig({
            id: "gig-2",
            title: "Tomorrow's Show"
          })
        ]
      }
    ]);

    expect(html).toContain("ALT//THURSDAYS");
    expect(html).not.toContain("Tomorrow&#x27;s Show");
  });
});
