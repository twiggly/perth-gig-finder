import { describe, expect, it, vi } from "vitest";

import {
  extractTheBirdLinkedImageUrl,
  normalizeTheBirdLinkedEventUrl,
  normalizeTheBirdRow,
  normalizeTheBirdWhatsOnRow,
  parseTheBirdFeedRows,
  parseTheBirdWhatsOnRows,
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T16:00:00.000Z"));

    try {
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
        artists: [],
        artistExtractionKind: "unknown"
      });
    } finally {
      vi.useRealTimers();
    }
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

  it("normalizes a weekly Thursday row with the featured lineup", () => {
    const normalized = normalizeTheBirdWhatsOnRow({
      Date: "30.04.26",
      Day: "Thursday",
      Time: "6:30pm",
      Price: 15,
      Vibe: "Alt ",
      Title: "ALT//THURSDAYS",
      Featuring: "Melānija, Esper, softwarebodyIV, tarsier, big trouble little china",
      Description:
        "butterflyviolence presents. ECLIPSE - a night of emotional digital soundscapes and echoing electronics.",
      "Ticket Link": ""
    });

    expect(normalized).toMatchObject({
      sourceSlug: "the-bird",
      externalId: "2026-04-30-alt-thursdays",
      sourceUrl: "https://www.williamstreetbird.com/whatson#2026-04-30-alt-thursdays",
      ticketUrl: null,
      title: "ALT//THURSDAYS",
      startsAt: "2026-04-30T10:30:00.000Z",
      startsAtPrecision: "exact",
      artists: ["Melānija", "Esper", "softwarebodyIV", "tarsier", "big trouble little china"],
      artistExtractionKind: "explicit_lineup"
    });
  });

  it("canonicalizes Humanitix ticket links to the linked event page", () => {
    expect(
      normalizeTheBirdLinkedEventUrl(
        "https://events.humanitix.com/class-of-orb-reunion/tickets?utm_source=bird"
      )
    ).toBe("https://events.humanitix.com/class-of-orb-reunion");
    expect(
      normalizeTheBirdLinkedEventUrl(
        "https://tickets.oztix.com.au/outlet/event/bc602244-415d-45de-86ac-a0a4b99940c0"
      )
    ).toBeNull();
  });

  it("extracts a linked event poster from Humanitix HTML", () => {
    expect(
      extractTheBirdLinkedImageUrl(`
        <html>
          <head>
            <meta property="og:image" content="https://images.humanitix.com/i/ece78d93-d240-44ae-ba00-ada24312a1cb.jpg@seo-500.jpg" />
          </head>
          <body></body>
        </html>
      `)
    ).toBe("https://images.humanitix.com/i/ece78d93-d240-44ae-ba00-ada24312a1cb.jpg@seo-500.jpg");
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

  it("rejects obvious non-music rows from the weekly feed", () => {
    const parsed = parseTheBirdWhatsOnRows([
      {
        Date: "21.04.26",
        Day: "Tuesday",
        Time: "6:30pm",
        Price: "FREE",
        Vibe: "live improv DND",
        Title: "Murder in the Moonlight",
        Featuring: "presented by Questdraft",
        Description:
          "An improvised, DnD inspired show set in a Noir, 40s landscape.",
        "Ticket Link": ""
      },
      {
        Date: "30.04.26",
        Day: "Thursday",
        Time: "6:30pm",
        Price: 15,
        Vibe: "Alt ",
        Title: "ALT//THURSDAYS",
        Featuring: "Melānija, Esper, softwarebodyIV, tarsier, big trouble little china",
        Description:
          "butterflyviolence presents. ECLIPSE - a night of emotional digital soundscapes and echoing electronics.",
        "Ticket Link": ""
      }
    ]);

    expect(parsed.failedCount).toBe(0);
    expect(parsed.gigs).toHaveLength(1);
    expect(parsed.gigs[0]?.title).toBe("ALT//THURSDAYS");
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
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("AKfycbxdag")) {
        return new Response(JSON.stringify(rows), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.includes("AKfycbzzgyned")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await theBirdSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(1);
    expect(result.failedCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("enriches Bird gigs with posters from linked Humanitix event pages", async () => {
    const rows: TheBirdFeedRow[] = [
      {
        Date: "03/05/2026",
        Day: "SUNDAY",
        "Event Title": "Class of Orb : Reunion",
        Info: "",
        "Ticket Link": "https://events.humanitix.com/class-of-orb-reunion/tickets"
      }
    ];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("script.google.com/macros")) {
        return new Response(JSON.stringify(url.includes("AKfycbxdag") ? rows : []), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url === "https://events.humanitix.com/class-of-orb-reunion") {
        return new Response(
          `
            <html>
              <head>
                <meta property="og:image" content="https://images.humanitix.com/i/ece78d93-d240-44ae-ba00-ada24312a1cb.jpg@seo-500.jpg" />
              </head>
            </html>
          `,
          {
            status: 200,
            headers: { "content-type": "text/html" }
          }
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await theBirdSource.fetchListings(fetchMock);

    expect(result.failedCount).toBe(0);
    expect(result.gigs).toHaveLength(1);
    expect(result.gigs[0]).toMatchObject({
      title: "Class of Orb : Reunion",
      imageUrl: "https://images.humanitix.com/i/ece78d93-d240-44ae-ba00-ada24312a1cb.jpg@seo-500.jpg",
      ticketUrl: "https://events.humanitix.com/class-of-orb-reunion/tickets"
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("merges weekly rows into matching coming-up rows before returning gigs", async () => {
    const comingUpRows: TheBirdFeedRow[] = [
      {
        Date: "01/05/2026",
        Day: "FRIDAY",
        "Event Title": "Dani Dray 'Tell Me' Single Launch",
        Info: "Doors 8pm | Music until 11:45pm",
        "Ticket Link":
          "https://tickets.oztix.com.au/outlet/event/bc602244-415d-45de-86ac-a0a4b99940c0"
      }
    ];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("AKfycbxdag")) {
        return new Response(JSON.stringify(comingUpRows), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.includes("AKfycbzzgyned")) {
        return new Response(
          JSON.stringify([
            {
              Date: "30.04.26",
              Day: "Thursday",
              Time: "6:30pm",
              Price: 15,
              Vibe: "Alt ",
              Title: "ALT//THURSDAYS",
              Featuring: "Melānija, Esper, softwarebodyIV, tarsier, big trouble little china",
              Description:
                "butterflyviolence presents. ECLIPSE - a night of emotional digital soundscapes and echoing electronics.",
              "Ticket Link": ""
            },
            {
              Date: "01.05.26",
              Day: "Friday",
              Time: "8pm",
              Price: 20,
              Vibe: "R&B / Soul",
              Title: "Dani Dray -Tell Me- single launch",
              Featuring: "The Vicar, Clare Perrott, SOLARA",
              Description:
                "Dani Dray launches her debut single “Tell Me” with support from The Vicar, Clare Perrott, and SOLARA.",
              "Ticket Link": ""
            }
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await theBirdSource.fetchListings(fetchMock);
    const dani = result.gigs.find((gig) => gig.title === "Dani Dray 'Tell Me' Single Launch");
    const thursdays = result.gigs.find((gig) => gig.title === "ALT//THURSDAYS");

    expect(result.failedCount).toBe(0);
    expect(result.gigs).toHaveLength(2);
    expect(dani).toMatchObject({
      ticketUrl:
        "https://tickets.oztix.com.au/outlet/event/bc602244-415d-45de-86ac-a0a4b99940c0",
      artists: ["The Vicar", "Clare Perrott", "SOLARA"]
    });
    expect(thursdays).toMatchObject({
      startsAt: "2026-04-30T10:30:00.000Z",
      artists: ["Melānija", "Esper", "softwarebodyIV", "tarsier", "big trouble little china"]
    });
  });

  it("merges weekly rows when the coming-up title only adds The Bird venue text", async () => {
    const comingUpRows: TheBirdFeedRow[] = [
      {
        Date: "26/04/2026",
        Day: "SUNDAY",
        "Event Title": "WESTEND EXPORT @ THE BIRD",
        Info: "Doors 8pm",
        "Ticket Link": ""
      }
    ];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("AKfycbxdag")) {
        return new Response(JSON.stringify(comingUpRows), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.includes("AKfycbzzgyned")) {
        return new Response(
          JSON.stringify([
            {
              Date: "26.04.26",
              Day: "Sunday",
              Time: "8pm",
              Price: "FREE",
              Vibe: "live music",
              Title: "Westend Export",
              Featuring: "WEX PARTY UNIT, Coyboy, Lala, Sneeze, Respondent & Joii",
              Description: "Westend Export returns to The Bird.",
              "Ticket Link": ""
            }
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await theBirdSource.fetchListings(fetchMock);

    expect(result.failedCount).toBe(0);
    expect(result.gigs).toHaveLength(1);
    expect(result.gigs[0]).toMatchObject({
      title: "WESTEND EXPORT @ THE BIRD",
      startsAt: "2026-04-26T12:00:00.000Z",
      artists: ["WEX PARTY UNIT", "Coyboy", "Lala", "Sneeze", "Respondent & Joii"],
      artistExtractionKind: "explicit_lineup"
    });
  });

  it("is registered in the shared source list", () => {
    expect(sources.map((source) => source.slug)).toContain("the-bird");
  });
});
