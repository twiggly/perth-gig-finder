import { describe, expect, it, vi } from "vitest";

import {
  normalizeTheBirdRow,
  parseTheBirdFeedRows,
  parseTheBirdStartTime,
  theBirdSource,
  type TheBirdFeedRow
} from "../sources/the-bird";
import { sources } from "../sources";

describe("the bird source adapter", () => {
  it("extracts exact times from doors text before later times", () => {
    expect(parseTheBirdStartTime("Doors 8pm | Music until 11:45pm")).toEqual({
      hour: 20,
      minute: 0,
      startsAtPrecision: "exact"
    });
  });

  it("falls back to the first standalone time when doors text is absent", () => {
    expect(parseTheBirdStartTime("From 4pm to late with DJs all afternoon")).toEqual({
      hour: 16,
      minute: 0,
      startsAtPrecision: "exact"
    });
  });

  it("normalizes a valid dated row with a real ticket link", () => {
    const normalized = normalizeTheBirdRow({
      Date: "24/04/2026",
      Day: "FRIDAY",
      "Event Title": "Dani Dray 'Tell Me' Single Launch",
      Info: "Doors 8pm | Music until 11:45pm",
      "Ticket Link":
        "https://tickets.oztix.com.au/outlet/event/bc602244-415d-45de-86ac-a0a4b99940c0?utm_source=bird"
    });

    expect(normalized).toMatchObject({
      sourceSlug: "the-bird",
      externalId: "2026-04-24-dani-dray-tell-me-single-launch",
      sourceUrl:
        "https://www.williamstreetbird.com/comingup#2026-04-24-dani-dray-tell-me-single-launch",
      ticketUrl:
        "https://tickets.oztix.com.au/outlet/event/bc602244-415d-45de-86ac-a0a4b99940c0",
      title: "Dani Dray 'Tell Me' Single Launch",
      description: "Doors 8pm | Music until 11:45pm",
      imageUrl: null,
      status: "active",
      startsAt: "2026-04-24T12:00:00.000Z",
      startsAtPrecision: "exact",
      endsAt: null,
      venue: {
        name: "The Bird",
        slug: "the-bird",
        suburb: "Northbridge",
        address: "181 William Street, Northbridge WA 6003",
        websiteUrl: "https://www.williamstreetbird.com/"
      },
      artists: ["Dani Dray 'Tell Me' Single Launch"]
    });
  });

  it("normalizes blank and free ticket links to null", () => {
    const free = normalizeTheBirdRow({
      Date: "03/05/2026",
      Day: "SUNDAY",
      "Event Title": "Class of Orb : Reunion",
      Info: "",
      "Ticket Link": "Free"
    });
    const blank = normalizeTheBirdRow({
      Date: "17/05/2026",
      Day: "SUNDAY",
      "Event Title": "TOMMYS",
      Info: "",
      "Ticket Link": ""
    });

    expect(free?.ticketUrl).toBeNull();
    expect(blank?.ticketUrl).toBeNull();
  });

  it("falls back to date precision when no clear time exists", () => {
    const normalized = normalizeTheBirdRow({
      Date: "15/05/2026",
      Day: "FRIDAY",
      "Event Title": "WEST ENVY - No Breaks Single Launch",
      Info: "Catch WEST ENVY'S first headline show at The Bird in Northbridge May 15th.",
      "Ticket Link":
        "https://tickets.oztix.com.au/outlet/event/026a5d47-c2ba-4f4b-a293-fb4a90bf9eaa"
    });

    expect(normalized?.startsAt).toBe("2026-05-15T04:00:00.000Z");
    expect(normalized?.startsAtPrecision).toBe("date");
  });

  it("skips placeholder rows and counts malformed rows as failures", () => {
    const parsed = parseTheBirdFeedRows([
      {
        Date: "26/05/2025",
        Day: "MONDAY",
        "Event Title": "Past event",
        Info: "placeholder",
        "Ticket Link": ""
      },
      {
        Date: "",
        Day: "",
        "Event Title": "",
        Info: "",
        "Ticket Link": ""
      },
      {
        Date: "31/02/2026",
        Day: "TUESDAY",
        "Event Title": "Broken row",
        Info: "Doors 8pm",
        "Ticket Link": ""
      },
      {
        Date: "24/05/2026",
        Day: "SUNDAY",
        "Event Title": "Bass @ The Bird",
        Info: "Running from 3pm – 10pm",
        "Ticket Link":
          "https://tickets.oztix.com.au/outlet/event/d9c7ae29-347c-43cb-ad74-8db5439fb0cf"
      }
    ]);

    expect(parsed.gigs).toHaveLength(1);
    expect(parsed.failedCount).toBe(1);
    expect(parsed.gigs[0]?.title).toBe("Bass @ The Bird");
  });

  it("fetches the official JSON feed without browser automation", async () => {
    const rows: TheBirdFeedRow[] = [
      {
        Date: "09/05/2026",
        Day: "SATURDAY",
        "Event Title": "Ghost Care",
        Info: "After a small break... Get ready for a party atmosphere with all your fave songs plus you may just get a sneak peak into new music coming for 2026.",
        "Ticket Link":
          "https://tickets.oztix.com.au/outlet/event/f6e0d226-cddf-41f0-be8b-0e7e637be324"
      }
    ];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await theBirdSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(1);
    expect(result.failedCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("is registered in the shared source list", () => {
    expect(sources.map((source) => source.slug)).toContain("the-bird");
  });
});
