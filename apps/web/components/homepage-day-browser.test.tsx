import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { DateGroup } from "@/lib/homepage-dates";
import type { GigCardRecord } from "@/lib/gigs";

import {
  HomepageDayBrowser,
  HomepageDayHeaderCover
} from "./homepage-day-browser";

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
    ends_at: null,
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
    venue_address: "181 William Street, Northbridge WA 6003",
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

  it("renders the sticky scroll cover as inert visual-only header markup", () => {
    const today = {
      dateKey: "2026-06-17",
      heading: "Wed, Jun 17th",
      items: [createGig()]
    };
    const tomorrow = {
      dateKey: "2026-06-18",
      heading: "Thu, Jun 18th",
      items: [createGig({ id: "gig-2" })]
    };
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <HomepageDayHeaderCover
          availableDayMap={
            new Map([
              [today.dateKey, { dateKey: today.dateKey, heading: today.heading }],
              [
                tomorrow.dateKey,
                { dateKey: tomorrow.dateKey, heading: tomorrow.heading }
              ]
            ])
          }
          fallbackHeading={today.heading}
          headingTrackStyle={
            {
              "--day-browser-heading-duration": "240ms"
            } as React.CSSProperties
          }
          loadedDayMap={
            new Map([
              [today.dateKey, today],
              [tomorrow.dateKey, tomorrow]
            ])
          }
          renderedHeadingPanes={[
            {
              dateKey: today.dateKey,
              motionRole: "from",
              phase: "animating"
            },
            {
              dateKey: tomorrow.dateKey,
              motionRole: "to",
              phase: "animating"
            }
          ]}
          transitionDirection="next"
        />
      </MantineProvider>
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("day-browser__header-cover");
    expect(html).toContain('data-stuck="true"');
    expect(html).toContain('data-direction="next"');
    expect(html).toContain('data-motion-role="from"');
    expect(html).toContain('data-motion-role="to"');
    expect(html).toContain("Wed, Jun 17th");
    expect(html).toContain("Thu, Jun 18th");
    expect(html).not.toContain("<button");
  });
});
