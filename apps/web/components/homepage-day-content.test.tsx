import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";
import type { HomepageDayPayload } from "@/lib/homepage-day-loading";
import type { GigCardRecord } from "@/lib/gigs";
import type { DayBrowserPaneState } from "./use-homepage-day-navigation";

import { HomepageDayContent } from "./homepage-day-content";

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

function createDay(
  overrides: Partial<HomepageDayPayload> = {}
): HomepageDayPayload {
  return {
    dateKey: "2026-04-29",
    heading: "Wed, Apr 29th",
    items: [createGig()],
    ...overrides
  };
}

function renderContent({
  activeDateKey = "2026-04-29",
  days = [createDay()],
  isContentAnimating = false,
  openGigId = null,
  renderedContentPanes = [
    {
      dateKey: "2026-04-29",
      motionRole: "active",
      phase: null
    }
  ],
  scrollAlignmentDateKey = null,
  scrollCarryoverDateKey = null,
  scrollOutgoingCompensationDateKey = null,
  scrollReserveTargetDateKey = null,
  transitionDirection
}: {
  activeDateKey?: string;
  days?: HomepageDayPayload[];
  isContentAnimating?: boolean;
  openGigId?: string | null;
  renderedContentPanes?: DayBrowserPaneState[];
  scrollAlignmentDateKey?: string | null;
  scrollCarryoverDateKey?: string | null;
  scrollOutgoingCompensationDateKey?: string | null;
  scrollReserveTargetDateKey?: string | null;
  transitionDirection?: "next" | "previous";
} = {}) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <HomepageDayContent
        activeDateKey={activeDateKey}
        contentViewportStyle={{
          "--day-browser-content-distance": "36px"
        } as React.CSSProperties}
        isContentAnimating={isContentAnimating}
        loadedDayMap={new Map(days.map((day) => [day.dateKey, day]))}
        onCloseGig={() => {}}
        onToggleGig={() => {}}
        openGigId={openGigId}
        renderedContentPanes={renderedContentPanes}
        scrollAlignmentDateKey={scrollAlignmentDateKey}
        scrollCarryoverDateKey={scrollCarryoverDateKey}
        scrollOutgoingCompensationDateKey={scrollOutgoingCompensationDateKey}
        scrollReserveTargetDateKey={scrollReserveTargetDateKey}
        scrollTargetContentRef={React.createRef<HTMLDivElement>()}
        transitionDirection={transitionDirection}
      />
    </MantineProvider>
  );
}

describe("HomepageDayContent", () => {
  it("renders gigs for the active loaded day", () => {
    const html = renderContent();

    expect(html).toContain("day-browser__content-viewport");
    expect(html).toContain("day-browser__content-track");
    expect(html).toContain("day-browser__content-align");
    expect(html).toContain('data-date="2026-04-29"');
    expect(html).toContain('data-active-date="true"');
    expect(html).toContain("day-browser__scroll-reserve");
    expect(html).not.toContain('data-scroll-reserve-carryover="true"');
    expect(html).not.toContain('data-scroll-reserve-target="true"');
    expect(html).not.toContain("day-browser__scroll-inset");
    expect(html).toContain("ALT//THURSDAYS");
  });

  it("renders an active empty grid for days with no gigs", () => {
    const html = renderContent({
      days: [
        createDay({
          items: []
        })
      ]
    });

    expect(html).toContain('data-date="2026-04-29"');
    expect(html).toContain('data-active-date="true"');
    expect(html).toContain("gig-grid");
    expect(html).toContain("day-browser__scroll-reserve");
    expect(html).not.toContain('data-scroll-reserve-carryover="true"');
    expect(html).not.toContain('data-scroll-reserve-target="true"');
    expect(html).not.toContain("day-browser__scroll-inset");
    expect(html).not.toContain("gig-card");
  });

  it("renders no pane content when a pane day is not loaded", () => {
    const html = renderContent({
      renderedContentPanes: [
        {
          dateKey: "2026-04-30",
          motionRole: "active",
          phase: null
        }
      ]
    });

    expect(html).not.toContain("day-browser__content-pane");
    expect(html).not.toContain("ALT//THURSDAYS");
  });

  it("preserves transition pane attributes and track direction", () => {
    const today = createDay();
    const tomorrow = createDay({
      dateKey: "2026-04-30",
      heading: "Thu, Apr 30th",
      items: [
        createGig({
          id: "gig-2",
          title: "Tomorrow's Show"
        })
      ]
    });
    const html = renderContent({
      days: [today, tomorrow],
      isContentAnimating: true,
      renderedContentPanes: [
        {
          dateKey: "2026-04-29",
          motionRole: "from",
          phase: "animating"
        },
        {
          dateKey: "2026-04-30",
          motionRole: "to",
          phase: "animating"
        }
      ],
      transitionDirection: "next"
    });

    expect(html).toContain('data-animating="true"');
    expect(html).toContain('data-direction="next"');
    expect(html).toContain('data-motion-role="from"');
    expect(html).toContain('data-motion-role="to"');
    expect(html).toContain('data-phase="animating"');
    expect(html).not.toContain('data-active-date="true"');
    expect(html.match(/day-browser__scroll-reserve/g)).toHaveLength(2);
    expect(html).not.toContain("day-browser__scroll-inset");
    expect(html).not.toContain('data-scroll-align-target="true"');
    expect(html).not.toContain('data-scroll-reserve-carryover="true"');
    expect(html).not.toContain('data-scroll-reserve-target="true"');
    expect(html.match(/day-browser__content-align/g)).toHaveLength(2);
    expect(html).toContain("Tomorrow&#x27;s Show");
  });

  it("marks only the active pane as the reserve target", () => {
    const html = renderContent({
      scrollReserveTargetDateKey: "2026-04-29"
    });

    expect(html).toContain('data-active-date="true"');
    expect(html).toContain('data-scroll-reserve-target="true"');
    expect(html).not.toContain('data-scroll-reserve-carryover="true"');
    expect(html).not.toContain('data-scroll-align-target="true"');
    expect(html.match(/day-browser__scroll-reserve/g)).toHaveLength(1);
    expect(html).not.toContain("day-browser__scroll-inset");
  });

  it("marks the incoming to pane as the reserve target", () => {
    const today = createDay();
    const tomorrow = createDay({
      dateKey: "2026-04-30",
      heading: "Thu, Apr 30th",
      items: [
        createGig({
          id: "gig-2",
          title: "Tomorrow's Show"
        })
      ]
    });
    const html = renderContent({
      days: [today, tomorrow],
      renderedContentPanes: [
        {
          dateKey: "2026-04-29",
          motionRole: "from",
          phase: "preparing"
        },
        {
          dateKey: "2026-04-30",
          motionRole: "to",
          phase: "preparing"
        }
      ],
      scrollReserveTargetDateKey: "2026-04-30",
      transitionDirection: "next"
    });

    expect(html).toContain('data-motion-role="from"');
    expect(html).toContain('data-motion-role="to"');
    expect(html).toContain('data-scroll-reserve-target="true"');
    expect(html.match(/data-scroll-reserve-target="true"/g)).toHaveLength(1);
    expect(html.match(/day-browser__scroll-reserve/g)).toHaveLength(2);
    expect(html).not.toContain("day-browser__scroll-inset");
  });

  it("marks only the incoming to pane as the scroll alignment target", () => {
    const today = createDay();
    const tomorrow = createDay({
      dateKey: "2026-04-30",
      heading: "Thu, Apr 30th",
      items: [
        createGig({
          id: "gig-2",
          title: "Tomorrow's Show"
        })
      ]
    });
    const html = renderContent({
      days: [today, tomorrow],
      renderedContentPanes: [
        {
          dateKey: "2026-04-29",
          motionRole: "from",
          phase: "animating"
        },
        {
          dateKey: "2026-04-30",
          motionRole: "to",
          phase: "animating"
        }
      ],
      scrollAlignmentDateKey: "2026-04-30",
      transitionDirection: "next"
    });

    expect(html).toContain('data-motion-role="from"');
    expect(html).toContain('data-motion-role="to"');
    expect(html).toContain('data-scroll-align-target="true"');
    expect(html.match(/data-scroll-align-target="true"/g)).toHaveLength(1);
    expect(html).toMatch(
      /class="[^"]*day-browser__content-align[^"]*" data-scroll-align-target="true"/
    );
    expect(html).not.toMatch(
      /class="[^"]*day-browser__content-pane[^"]*"[^>]*data-scroll-align-target="true"/
    );
  });

  it("marks only the outgoing from pane as the scroll compensation target", () => {
    const today = createDay();
    const tomorrow = createDay({
      dateKey: "2026-04-30",
      heading: "Thu, Apr 30th",
      items: [
        createGig({
          id: "gig-2",
          title: "Tomorrow's Show"
        })
      ]
    });
    const html = renderContent({
      days: [today, tomorrow],
      renderedContentPanes: [
        {
          dateKey: "2026-04-29",
          motionRole: "from",
          phase: "preparing"
        },
        {
          dateKey: "2026-04-30",
          motionRole: "to",
          phase: "preparing"
        }
      ],
      scrollOutgoingCompensationDateKey: "2026-04-29",
      transitionDirection: "next"
    });

    expect(html).toContain('data-motion-role="from"');
    expect(html).toContain('data-motion-role="to"');
    expect(html).toContain('data-scroll-compensate-outgoing="true"');
    expect(html.match(/data-scroll-compensate-outgoing="true"/g)).toHaveLength(1);
    expect(html).toMatch(
      /class="[^"]*day-browser__content-align[^"]*" data-scroll-compensate-outgoing="true"/
    );
  });

  it("does not keep the scroll alignment target on the final active pane", () => {
    const html = renderContent({
      scrollAlignmentDateKey: "2026-04-29"
    });

    expect(html).toContain('data-motion-role="active"');
    expect(html).not.toContain('data-scroll-align-target="true"');
  });

  it("does not keep the scroll alignment target during transition settling", () => {
    const today = createDay();
    const tomorrow = createDay({
      dateKey: "2026-04-30",
      heading: "Thu, Apr 30th",
      items: [
        createGig({
          id: "gig-2",
          title: "Tomorrow's Show"
        })
      ]
    });
    const html = renderContent({
      days: [today, tomorrow],
      renderedContentPanes: [
        {
          dateKey: "2026-04-29",
          motionRole: "from",
          phase: "settling"
        },
        {
          dateKey: "2026-04-30",
          motionRole: "to",
          phase: "settling"
        }
      ],
      scrollAlignmentDateKey: "2026-04-30",
      transitionDirection: "next"
    });

    expect(html).toContain('data-phase="settling"');
    expect(html).not.toContain('data-scroll-align-target="true"');
  });

  it("marks the outgoing from pane as carryover without making it the target", () => {
    const today = createDay();
    const tomorrow = createDay({
      dateKey: "2026-04-30",
      heading: "Thu, Apr 30th",
      items: [
        createGig({
          id: "gig-2",
          title: "Tomorrow's Show"
        })
      ]
    });
    const html = renderContent({
      days: [today, tomorrow],
      renderedContentPanes: [
        {
          dateKey: "2026-04-29",
          motionRole: "from",
          phase: "preparing"
        },
        {
          dateKey: "2026-04-30",
          motionRole: "to",
          phase: "preparing"
        }
      ],
      scrollCarryoverDateKey: "2026-04-29",
      scrollReserveTargetDateKey: "2026-04-30",
      transitionDirection: "next"
    });

    expect(html).toContain('data-motion-role="from"');
    expect(html).toContain('data-motion-role="to"');
    expect(html).toContain('data-scroll-reserve-carryover="true"');
    expect(html).toContain('data-scroll-reserve-target="true"');
    expect(html.match(/data-scroll-reserve-carryover="true"/g)).toHaveLength(1);
    expect(html.match(/data-scroll-reserve-target="true"/g)).toHaveLength(1);
    expect(html.match(/day-browser__scroll-reserve/g)).toHaveLength(2);
    expect(html).not.toContain("day-browser__scroll-inset");
  });

  it("passes the open gig id through to the matching gig card", () => {
    const html = renderContent({
      openGigId: "gig-1"
    });

    expect(html).toContain("gig-card--open");
    expect(html).toContain("gig-card__popover");
    expect(html).toContain("Buy tickets");
    expect(html).toContain("Listing @ The Bird");
  });
});
