import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { HomepageDayPayload } from "@/lib/homepage-day-loading";
import type { GigCardRecord } from "@/lib/gigs";
import type { DayBrowserPaneState } from "./use-homepage-day-navigation";

import { HomepageDayContent } from "./homepage-day-content";

vi.mock("next/image", async () => {
  const React = await import("react");

  return {
    default: function MockImage({
      alt,
      quality: _quality,
      src,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & {
      quality?: number;
      src: string;
    }) {
      return React.createElement("img", {
        ...props,
        alt,
        src
      });
    }
  };
});

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

function createGigWithImage(
  overrides: Partial<GigCardRecord> = {}
): GigCardRecord {
  return createGig({
    image_height: 900,
    image_width: 600,
    source_image_url: "https://assets.oztix.com.au/poster.jpg",
    ...overrides
  });
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
  scrollRestorationAlignmentDateKey = null,
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
  scrollRestorationAlignmentDateKey?: string | null;
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
        scrollRestorationAlignmentDateKey={scrollRestorationAlignmentDateKey}
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

  it("eagerly loads the first four renderable posters in the active pane", () => {
    const html = renderContent({
      days: [
        createDay({
          items: [
            createGigWithImage({
              id: "gig-1",
              title: "First Poster"
            }),
            createGigWithImage({
              id: "gig-2",
              title: "Second Poster",
              source_image_url: "https://assets.oztix.com.au/poster-2.jpg"
            }),
            createGigWithImage({
              id: "gig-3",
              title: "Third Poster",
              source_image_url: "https://assets.oztix.com.au/poster-3.jpg"
            }),
            createGigWithImage({
              id: "gig-4",
              title: "Fourth Poster",
              source_image_url: "https://assets.oztix.com.au/poster-4.jpg"
            }),
            createGigWithImage({
              id: "gig-5",
              title: "Fifth Poster",
              source_image_url: "https://assets.oztix.com.au/poster-5.jpg"
            })
          ]
        })
      ]
    });

    expect(html.match(/loading="eager"/g)).toHaveLength(4);
    expect(html).toMatch(
      /<img(?=[^>]*alt="First Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
    expect(html).toMatch(
      /<img(?=[^>]*alt="Second Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
    expect(html).toMatch(
      /<img(?=[^>]*alt="Third Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
    expect(html).toMatch(
      /<img(?=[^>]*alt="Fourth Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
    expect(html).not.toMatch(
      /<img(?=[^>]*alt="Fifth Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
  });

  it("does not eagerly load posters in transition panes", () => {
    const today = createDay({
      items: [
        createGigWithImage({
          id: "gig-1",
          title: "Today Poster"
        })
      ]
    });
    const tomorrow = createDay({
      dateKey: "2026-04-30",
      heading: "Thu, Apr 30th",
      items: [
        createGigWithImage({
          id: "gig-2",
          title: "Tomorrow Poster",
          source_image_url: "https://assets.oztix.com.au/poster-2.jpg"
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
      transitionDirection: "next"
    });

    expect(html).toContain("Today Poster");
    expect(html).toContain("Tomorrow Poster");
    expect(html).not.toContain('loading="eager"');
  });

  it("does not count non-renderable posters toward the eager image limit", () => {
    const html = renderContent({
      days: [
        createDay({
          items: [
            createGig({
              id: "gig-1",
              title: "No Poster",
              venue_name: "Milk Bar",
              venue_slug: "milk-bar"
            }),
            createGigWithImage({
              id: "gig-2",
              title: "First Renderable Poster"
            }),
            createGigWithImage({
              id: "gig-3",
              title: "Second Renderable Poster",
              source_image_url: "https://assets.oztix.com.au/poster-2.jpg"
            }),
            createGigWithImage({
              id: "gig-4",
              title: "Third Renderable Poster",
              source_image_url: "https://assets.oztix.com.au/poster-3.jpg"
            }),
            createGigWithImage({
              id: "gig-5",
              title: "Fourth Renderable Poster",
              source_image_url: "https://assets.oztix.com.au/poster-4.jpg"
            }),
            createGigWithImage({
              id: "gig-6",
              title: "Fifth Renderable Poster",
              source_image_url: "https://assets.oztix.com.au/poster-5.jpg"
            })
          ]
        })
      ]
    });

    expect(html.match(/loading="eager"/g)).toHaveLength(4);
    expect(html).toMatch(
      /<img(?=[^>]*alt="First Renderable Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
    expect(html).toMatch(
      /<img(?=[^>]*alt="Third Renderable Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
    expect(html).not.toMatch(/alt="No Poster poster"/);
    expect(html).toMatch(
      /<img(?=[^>]*alt="Fourth Renderable Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
    expect(html).not.toMatch(
      /<img(?=[^>]*alt="Fifth Renderable Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
  });

  it("counts The Bird placeholder as a renderable eager image", () => {
    const html = renderContent({
      days: [
        createDay({
          items: [
            createGig({
              id: "gig-1",
              title: "Bird Placeholder",
              venue_slug: "the-bird"
            }),
            createGigWithImage({
              id: "gig-2",
              title: "First Real Poster"
            }),
            createGigWithImage({
              id: "gig-3",
              title: "Second Real Poster",
              source_image_url: "https://assets.oztix.com.au/poster-2.jpg"
            }),
            createGigWithImage({
              id: "gig-4",
              title: "Third Real Poster",
              source_image_url: "https://assets.oztix.com.au/poster-3.jpg"
            }),
            createGigWithImage({
              id: "gig-5",
              title: "Fourth Real Poster",
              source_image_url: "https://assets.oztix.com.au/poster-4.jpg"
            }),
            createGigWithImage({
              id: "gig-6",
              title: "Fifth Real Poster",
              source_image_url: "https://assets.oztix.com.au/poster-5.jpg"
            })
          ]
        })
      ]
    });

    expect(html.match(/loading="eager"/g)).toHaveLength(4);
    expect(html).toMatch(
      /<img(?=[^>]*alt="Bird Placeholder poster")(?=[^>]*loading="eager")[^>]*>/
    );
    expect(html).toMatch(
      /<img(?=[^>]*alt="Third Real Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
    expect(html).not.toMatch(
      /<img(?=[^>]*alt="Fifth Real Poster poster")(?=[^>]*loading="eager")[^>]*>/
    );
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

  it("keeps restoration alignment on the incoming pane during settling", () => {
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
      scrollRestorationAlignmentDateKey: "2026-04-30",
      transitionDirection: "next"
    });

    expect(html).toContain('data-phase="settling"');
    expect(html).toContain('data-scroll-align-target="true"');
    expect(html.match(/data-scroll-align-target="true"/g)).toHaveLength(1);
    expect(html).toMatch(
      /class="[^"]*day-browser__content-align[^"]*" data-scroll-align-target="true"/
    );
  });

  it("keeps restoration alignment on the final active pane until scroll handoff", () => {
    const html = renderContent({
      scrollRestorationAlignmentDateKey: "2026-04-29"
    });

    expect(html).toContain('data-motion-role="active"');
    expect(html).toContain('data-scroll-align-target="true"');
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
