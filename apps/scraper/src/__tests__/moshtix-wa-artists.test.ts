import { describe, expect, it, vi } from "vitest";

import {
  buildMoshtixWaSearchUrl,
  extractMoshtixArtists,
  moshtixWaSource,
  normalizeMoshtixEventPage,
  parseMoshtixSearchPage
} from "../sources/moshtix-wa";

function buildSearchResult(input: {
  eventId: string;
  title: string;
  eventUrl: string;
  imageUrl: string;
  startDate: string;
  endDate?: string;
  venueName: string;
  streetAddress?: string;
  locality?: string;
  region?: string;
  teaser?: string;
}): string {
  return `
    <div class="searchresult clearfix" data-event-id="${input.eventId}">
      <div class="searchresult_image">
        <a href="${input.eventUrl}">
          <img src="${input.imageUrl}" alt="${input.title}" />
        </a>
      </div>
      <div class="searchresult_content">
        <h2 class="main-event-header">
          <a href="${input.eventUrl}">
            <span>${input.title}</span>
          </a>
        </h2>
        <h2 class="main-artist-event-header">
          Tue 7 Apr 2026, 7.30pm |
          <a href="/v2/venues/example/1">
            <span>${input.venueName}</span>,
            <span><span><span>${input.region ?? "WA"}</span></span></span>
          </a>
        </h2>
        <p><span>${input.teaser ?? ""}</span> <a href="${input.eventUrl}">more &raquo;</a></p>
        <a href="${input.eventUrl}" class="button_orange">Get Tickets</a>
        <section>
          <script type="application/ld+json">
${JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: input.title,
    image: input.imageUrl,
    url: input.eventUrl,
    startDate: input.startDate,
    endDate: input.endDate ?? input.startDate,
    eventStatus: "EventScheduled",
    location: {
      "@type": "Place",
      name: input.venueName,
      sameAs: "",
      address: {
        "@type": "PostalAddress",
        streetAddress: input.streetAddress ?? "",
        addressLocality: input.locality ?? "",
        addressRegion: input.region ?? "WA"
      }
    }
  }
])}
          </script>
        </section>
      </div>
    </div>
  `;
}

function buildSearchPage(input: {
  results: string[];
  totalPages?: number;
}): string {
  const pagination =
    (input.totalPages ?? 1) > 1
      ? `
        <section class="pagination">
          <a href="/v2/search?StateId=8&TimePeriod=6&FromDate=07%20Apr%202026&FromDateDisplay=07%20Apr%202026&CategoryList=2%2C&Page=2">2</a>
        </section>
      `
      : "";

  return `
    <html>
      <body>
        <section id="search-results">
          ${input.results.join("\n")}
        </section>
        ${pagination}
      </body>
    </html>
  `;
}

function buildEventPage(input: {
  eventId: string;
  title: string;
  eventUrl: string;
  startDate: string;
  endDate: string;
  customImage?: string;
  highResImage?: string;
  venueName: string;
  venueWebsite?: string;
  streetAddress?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  descriptionHtml?: string;
  statusText?: string;
  artists?: string[];
  offersUrl?: string;
}): string {
  return `
    <script>
      var moshtixEventData = ${JSON.stringify({
        id: Number.parseInt(input.eventId, 10),
        name: input.title,
        startDate: input.startDate,
        endDate: input.endDate,
        status: null,
        client: {
          id: 1,
          name: "Mojos Bar"
        },
        venue: {
          id: 788,
          name: input.venueName,
          state: input.region ?? "WA"
        },
        category: {
          id: 2,
          name: "Live Music"
        },
        customImage: input.customImage ?? null,
        highResImage: input.highResImage ?? null,
        artists: input.artists ?? [input.title]
      })};
    </script>
    <section id="status-linked-section">${input.statusText ?? ""}</section>
    <section id="event-summary-section">
      <div id="event-summary-block" data-event-link="${input.eventUrl}"></div>
      <a id="event-summary-thumbnail" href="#">
        <img src="${input.highResImage ?? input.customImage ?? ""}" alt="${input.title}" />
      </a>
      <a class="button_orange" href="${input.offersUrl ?? input.eventUrl}">Get Tickets</a>
    </section>
    <section id="event-structured-data-section">
      <script type="application/ld+json">
${JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: input.title,
    image: input.highResImage ?? input.customImage ?? null,
    url: input.eventUrl,
    startDate: input.startDate,
    endDate: input.endDate,
    eventStatus: "EventScheduled",
    location: {
      "@type": "Place",
      name: input.venueName,
      sameAs: input.venueWebsite ?? "",
      address: {
        "@type": "PostalAddress",
        streetAddress: input.streetAddress ?? "",
        addressLocality: input.locality ?? "",
        addressRegion: input.region ?? "WA",
        postalCode: input.postalCode ?? ""
      }
    },
    offers: [
      {
        "@type": "Offer",
        url: input.offersUrl ?? input.eventUrl
      }
    ],
    performers: (input.artists ?? [input.title]).map((name) => ({
      "@type": "Person",
      name
    }))
  }
])}
      </script>
    </section>
    <section id="event-details-section" class="moduleseparator">
      <div class="fr-view">${input.descriptionHtml ?? ""}</div>
    </section>
  `;
}


describe("moshtix wa artist extraction", () => {
  it("parses artists from Moshtix title and description lines when structured performers are missing", () => {
    const listing = parseMoshtixSearchPage(
      buildSearchPage({
        results: [
          buildSearchResult({
            eventId: "193703",
            title: "Dean Haitani + Dilip N The Davs",
            eventUrl: "https://www.moshtix.com.au/v2/event/dean-haitani-dilip-n-the-davs/193703",
            imageUrl: "https://static.moshtix.com.au/uploads/deanx140x140",
            startDate: "2026-04-28T19:30:00",
            endDate: "2026-04-28T22:30:00",
            venueName: "Mojos Bar, North Fremantle",
            streetAddress: "237 Queen Victoria St",
            locality: "North Fremantle"
          })
        ]
      })
    ).listings[0];

    const gig = normalizeMoshtixEventPage({
      listing,
      html: buildEventPage({
        eventId: "193703",
        title: "Dean Haitani + Dilip N The Davs",
        eventUrl: listing.eventUrl,
        startDate: "2026-04-28T19:30:00",
        endDate: "2026-04-28T22:30:00",
        venueName: "Mojos Bar, North Fremantle",
        streetAddress: "237 Queen Victoria St",
        locality: "North Fremantle",
        region: "WA",
        postalCode: "6159",
        descriptionHtml:
          "<p><strong>The PERTH BLUES CLUB presents</strong></p><p><strong>Dean Haitani + Dilip N The Davs</strong></p><h1>Dean Haitani | 7.30pm</h1><h1>Dilip N The Davs | 9.00pm</h1>",
        artists: []
      })
    });

    expect(gig.artists).toEqual(["Dean Haitani", "Dilip N The Davs"]);
    expect(gig.artistExtractionKind).toBe("parsed_text");
  });

  it("parses title support markers and drops placeholder support names", () => {
    const extraction = extractMoshtixArtists({
      title: "Fever Dream W/ Alias Error + More",
      descriptionHtml: null,
      structuredEvent: null,
      eventData: {
        name: "Fever Dream W/ Alias Error + More",
        artists: [],
        venue: {
          name: "The Bird"
        },
        client: {
          name: "The Bird"
        }
      },
      venue: {
        name: "The Bird",
        slug: "the-bird",
        suburb: "Northbridge",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Fever Dream", "Alias Error"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("parses quoted release tours and uses exact title casing for Moshtix artists", () => {
    const venue = {
      name: "Rosemount Hotel",
      slug: "rosemount-hotel",
      suburb: "North Perth",
      address: null,
      websiteUrl: null
    };

    expect(
      extractMoshtixArtists({
        title: "ASH ‘1977’ 30th Anniversary Tour",
        descriptionHtml: null,
        structuredEvent: { performers: [] },
        eventData: { artists: [], venue: { name: "Rosemount Hotel" } },
        venue
      })
    ).toEqual({ artists: ["ASH"], artistExtractionKind: "parsed_text" });

    expect(
      extractMoshtixArtists({
        title: 'MONO "Snowdrop" Australian Tour 2027',
        descriptionHtml: null,
        structuredEvent: { performers: [] },
        eventData: { artists: [], venue: { name: "The Rechabite" } },
        venue: { ...venue, name: "The Rechabite", slug: "the-rechabite" }
      })
    ).toEqual({ artists: ["MONO"], artistExtractionKind: "parsed_text" });

    expect(
      extractMoshtixArtists({
        title: "Baker Boy",
        descriptionHtml: null,
        structuredEvent: { performers: [{ name: "baker boy" }] },
        eventData: { artists: ["baker boy"], venue: { name: "Rosemount Hotel" } },
        venue
      }).artists
    ).toEqual(["Baker Boy"]);
  });

  it("uses title support marker order when Moshtix structured artists only name the support", () => {
    const extraction = extractMoshtixArtists({
      title: "Fever Dream W/ Alias Error + More",
      descriptionHtml: null,
      structuredEvent: {
        performers: [{ name: "Alias Error" }]
      },
      eventData: {
        name: "Fever Dream W/ Alias Error + More",
        artists: ["Alias Error"],
        venue: {
          name: "The Bird"
        },
        client: {
          name: "The Bird"
        }
      },
      venue: {
        name: "The Bird",
        slug: "the-bird",
        suburb: "Northbridge",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Fever Dream", "Alias Error"],
      artistExtractionKind: "structured"
    });
  });

  it("parses standalone Moshtix description lineups with malformed quote markers", () => {
    const extraction = extractMoshtixArtists({
      title: "Gloss Bitter and Insolent EP Launch",
      descriptionHtml:
        "<p>w' Flora Road, Dreamspeed + Special Beam Cannon</p><p>Fresh off the back of their debut single, local shoegaze powerhouse Gloss are back to launch their debut EP.</p><p>Support from loved ones Flora Road, Dreamspeed, and Special Beam Cannon!</p>",
      structuredEvent: {
        location: {
          name: "Mojos Bar, North Fremantle"
        },
        performers: [
          { name: "Mojos Bar Homepage Gallery" },
          { name: "mojosbarwa" },
          { name: "Mojos Bar" }
        ]
      },
      eventData: {
        name: "Gloss Bitter and Insolent EP Launch",
        artists: ["Mojos Bar Homepage Gallery", "mojosbarwa", "Mojos Bar"],
        venue: {
          name: "Mojos Bar, North Fremantle"
        },
        client: {
          name: "Mojo's Bar"
        }
      },
      venue: {
        name: "Mojos Bar",
        slug: "mojos-bar",
        suburb: "North Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Flora Road", "Dreamspeed", "Special Beam Cannon"],
      artistExtractionKind: "parsed_text"
    });
  });

  it.each(["w/ No Bride", "W. No Bride", "w' No Bride", "w’ No Bride"])(
    "parses the standalone Moshtix description marker in %s",
    (lineupLine) => {
      const extraction = extractMoshtixArtists({
        title: "Late Show",
        descriptionHtml: `<p>${lineupLine}</p>`,
        structuredEvent: null,
        eventData: {
          name: "Late Show",
          artists: [],
          venue: {
            name: "Mojos Bar, North Fremantle"
          },
          client: {
            name: "Mojo's Bar"
          }
        },
        venue: {
          name: "Mojos Bar",
          slug: "mojos-bar",
          suburb: "North Fremantle",
          address: null,
          websiteUrl: null
        }
      });

      expect(extraction).toEqual({
        artists: ["No Bride"],
        artistExtractionKind: "parsed_text"
      });
    }
  );

  it("does not parse embedded shorthand or broad sponsor wording from Moshtix descriptions", () => {
    const extraction = extractMoshtixArtists({
      title: "Community Showcase",
      descriptionHtml:
        "<p>Tickets include entry w/ a complimentary drink.</p><p>Supported by Double J</p>",
      structuredEvent: null,
      eventData: {
        name: "Community Showcase",
        artists: [],
        venue: {
          name: "Mojos Bar, North Fremantle"
        },
        client: {
          name: "Mojo's Bar"
        }
      },
      venue: {
        name: "Mojos Bar",
        slug: "mojos-bar",
        suburb: "North Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: [],
      artistExtractionKind: "unknown"
    });
  });

  it("repairs Moshtix artists from stored standalone description lineups", () => {
    const extraction = moshtixWaSource.repairArtists?.({
      listing: {
        name: "Gloss Bitter and Insolent EP Launch"
      },
      eventData: {
        name: "Gloss Bitter and Insolent EP Launch",
        artists: ["Mojos Bar Homepage Gallery", "mojosbarwa", "Mojos Bar"],
        venue: {
          name: "Mojos Bar, North Fremantle"
        },
        client: {
          name: "Mojo's Bar"
        }
      },
      structuredEvent: {
        name: "Gloss Bitter and Insolent EP Launch",
        location: {
          name: "Mojos Bar, North Fremantle"
        },
        performers: [
          { name: "Mojos Bar Homepage Gallery" },
          { name: "mojosbarwa" },
          { name: "Mojos Bar" }
        ]
      },
      descriptionHtml:
        "<p>w' Flora Road, Dreamspeed + Special Beam Cannon</p><p>Fresh off the back of their debut single.</p>"
    });

    expect(extraction).toEqual({
      artists: ["Flora Road", "Dreamspeed", "Special Beam Cannon"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("strips Moshtix special-guest labels while preserving headliner order", () => {
    const extraction = extractMoshtixArtists({
      title: "Stereolab | with special guests Mick Harvey & Amanda Acevedo",
      descriptionHtml: null,
      structuredEvent: {
        performers: [{ name: "special guests Mick Harvey & Amanda Acevedo" }]
      },
      eventData: {
        name: "Stereolab | with special guests Mick Harvey & Amanda Acevedo",
        artists: ["special guests Mick Harvey & Amanda Acevedo"],
        venue: {
          name: "Freo.Social"
        },
        client: {
          name: "Freo.Social"
        }
      },
      venue: {
        name: "Freo.Social",
        slug: "freo-social",
        suburb: "Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Stereolab", "Mick Harvey & Amanda Acevedo"],
      artistExtractionKind: "structured"
    });
  });

  it("decodes Moshtix HTML entities before deduping artist names", () => {
    const extraction = extractMoshtixArtists({
      title: "SEUN KUTI & EGYPT 80",
      descriptionHtml: null,
      structuredEvent: {
        performers: [
          { name: "SEUN KUTI & EGYPT 80" },
          { name: "SEUN KUTI" },
          { name: "SEUN KUTI &amp; EGYPT 80" }
        ]
      },
      eventData: {
        name: "SEUN KUTI & EGYPT 80",
        artists: ["SEUN KUTI & EGYPT 80", "SEUN KUTI", "SEUN KUTI &amp; EGYPT 80"],
        venue: {
          name: "Freo.Social"
        },
        client: {
          name: "Freo.Social"
        }
      },
      venue: {
        name: "Freo.Social",
        slug: "freo-social",
        suburb: "Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["SEUN KUTI & EGYPT 80", "SEUN KUTI"],
      artistExtractionKind: "structured"
    });
  });

  it("extracts role-qualified Moshtix performers and dedupes terminal entities", () => {
    const title = "Georgie Aué: A Norah Jones Tribute";
    const descriptionHtml = [
      "<p>Get taken away with the melodies of Norah Jones</p>",
      "<p>Doors 6 pm, Band at 7.30 pm</p>",
      "<p>Duke of George presents</p>",
      `<p>${title}</p>`,
      "<p>Jazz vocalist, pianist and songwriter, Georgie Aué, presents a tribute.</p>",
      "<p>Charming audiences with a soulful performance.</p>",
      "<p>The show has played to sold-out audiences.</p>",
      "<p>Hear Georgie Aué and her band perform.<br><br>Featuring:</p>",
      "<p>Georgie Aué - vocals and piano</p>",
      "<p>Dan Garner - guitar</p>",
      "<p>Zac Grafton - bass</p>",
      '<p>Alex Reid - drums<br><br>"Elegant costuming and a beautiful setting." - 5 stars</p>'
    ].join("");
    const eventData = {
      name: title,
      artists: ["Duke Of George", "The Duke of George", "Georgie Aué"],
      venue: {
        name: "The Duke of George"
      },
      client: {
        name: "The Duke of George"
      }
    };
    const structuredEvent = {
      name: title,
      location: {
        name: "The Duke of George"
      },
      performers: [
        { name: "Duke Of George" },
        { name: "The Duke of George" },
        { name: "Georgie Au&#233;" }
      ]
    };
    const venue = {
      name: "The Duke of George",
      slug: "the-duke-of-george",
      suburb: "East Fremantle",
      address: "135 Duke St, East Fremantle WA 6158",
      websiteUrl: null
    };
    const expectedExtraction = {
      artists: ["Georgie Aué", "Dan Garner", "Zac Grafton", "Alex Reid"],
      artistExtractionKind: "structured" as const
    };

    expect(
      extractMoshtixArtists({
        title,
        descriptionHtml,
        structuredEvent,
        eventData,
        venue
      })
    ).toEqual(expectedExtraction);
    expect(
      moshtixWaSource.repairArtists?.({
        listing: { name: title },
        eventData,
        structuredEvent,
        descriptionHtml
      })
    ).toEqual(expectedExtraction);
  });

  it("accepts common performer-credit dash and role-list variants", () => {
    const extraction = extractMoshtixArtists({
      title: "Quartet Showcase",
      descriptionHtml: [
        "<p>Casey One - vocals and piano</p>",
        "<p>Casey Two – lead guitar / backing vocals</p>",
        "<p>Casey Three — double bass, percussion &amp; flute</p>",
        "<p>Casey Four - vocals drums</p>",
        "<p>Casey Five – fiddle &amp; vocals</p>",
        "<p>Casey Six - pedal steel guitar / vocals</p>"
      ].join(""),
      structuredEvent: null,
      eventData: {
        name: "Quartet Showcase",
        artists: [],
        venue: { name: "The Duke of George" },
        client: { name: "The Duke of George" }
      },
      venue: {
        name: "The Duke of George",
        slug: "the-duke-of-george",
        suburb: "East Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: [
        "Casey One",
        "Casey Two",
        "Casey Three",
        "Casey Four",
        "Casey Five",
        "Casey Six"
      ],
      artistExtractionKind: "parsed_text"
    });
  });

  it("extracts complete Moshtix lineups from explicitly labelled blocks", () => {
    const venue = {
      name: "The Rechabite",
      slug: "the-rechabite",
      suburb: "Northbridge",
      address: null,
      websiteUrl: null
    };
    const eventData = {
      name: "WAM Showcase 2026",
      artists: ["BLUSH"],
      venue: { name: "The Rechabite" },
      client: { name: "WAM" }
    };

    expect(
      extractMoshtixArtists({
        title: "WAM Showcase 2026",
        descriptionHtml:
          "<p>2026 LINE UP:</p><p>BIRDLAND</p><p>BLUSH</p><p>BOOX KID</p><p>MEMBERS GET DISCOUNT TICKETS!</p>",
        structuredEvent: null,
        eventData,
        venue
      })
    ).toEqual({
      artists: ["BIRDLAND", "BLUSH", "BOOX KID"],
      artistExtractionKind: "structured"
    });
    expect(
      extractMoshtixArtists({
        title: "Neko Nation Purrth (featuring S3RL)",
        descriptionHtml:
          "<p>🎼DJ LINEUP</p><ul><li>S3RL (QLD)</li><li>Percival (QLD)</li><li>Nompire (QLD)</li></ul><p>ADDITIONAL DJs &amp; PERFORMERS to be announced soon!</p>",
        structuredEvent: null,
        eventData: {
          ...eventData,
          name: "Neko Nation Purrth (featuring S3RL)",
          artists: ["DJ S3RL (emfa) QLD"]
        },
        venue
      })
    ).toEqual({
      artists: ["S3RL", "Percival", "Nompire"],
      artistExtractionKind: "parsed_text"
    });
    expect(
      extractMoshtixArtists({
        title: "Billie Rogers",
        descriptionHtml:
          "<p>Billie Rogers</p><p>The Band</p><p>Billie Rogers • Dave Brewer • Elliot Smith</p>",
        structuredEvent: null,
        eventData: { ...eventData, name: "Billie Rogers", artists: [] },
        venue
      })
    ).toEqual({
      artists: ["Billie Rogers", "Dave Brewer", "Elliot Smith"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("extracts a headliner and supports from an explicit Moshtix support block", () => {
    const descriptionHtml = [
      "<p>EDDY CURRENT SUPPRESSION RING</p>",
      "<p>Formed in the front room of a vinyl pressing plant, ECSR are an Australian band.</p>",
      "<p>With support from:</p>",
      "<p>Lyndon Blue Band</p>",
      "<p>Sooks</p>",
      "<p>DOORS: 8PM</p>"
    ].join("");
    const venue = {
      name: "The Rechabite",
      slug: "the-rechabite",
      suburb: "Northbridge",
      address: null,
      websiteUrl: null
    };
    const eventData = {
      name: "EDDY CURRENT SUPPRESSION RING",
      artists: [],
      venue: { name: "The Rechabite" }
    };
    const expectedExtraction = {
      artists: ["EDDY CURRENT SUPPRESSION RING", "Lyndon Blue Band", "Sooks"],
      artistExtractionKind: "parsed_text" as const
    };

    expect(
      extractMoshtixArtists({
        title: "EDDY CURRENT SUPPRESSION RING",
        descriptionHtml,
        structuredEvent: { performers: [], location: { name: "The Rechabite" } },
        eventData,
        venue
      })
    ).toEqual(expectedExtraction);
    expect(
      moshtixWaSource.repairArtists?.({
        eventData,
        structuredEvent: {
          name: "EDDY CURRENT SUPPRESSION RING",
          performers: [],
          location: { name: "The Rechabite" }
        },
        descriptionHtml
      })
    ).toEqual(expectedExtraction);
  });

  it("extracts only explicitly current Moshtix guest and role rosters", () => {
    const venue = {
      name: "The Rechabite",
      slug: "the-rechabite",
      suburb: "Northbridge",
      address: null,
      websiteUrl: null
    };

    expect(
      extractMoshtixArtists({
        title: "Ninajirachi",
        descriptionHtml:
          "<p>Ninajirachi announces her headline dates. Joined by special guests Lucy Bedroque and daine, the tour follows a monumental year.</p>",
        structuredEvent: { performers: [{ name: "Ninajirachi" }] },
        eventData: { name: "Ninajirachi", artists: ["Ninajirachi"] },
        venue
      })
    ).toEqual({
      artists: ["Ninajirachi", "Lucy Bedroque", "daine"],
      artistExtractionKind: "structured"
    });

    expect(
      extractMoshtixArtists({
        title: "The Exploding Universe of Ed Kuepper",
        descriptionHtml:
          "<p>A full band performance featuring the added talents of drummer Mark Dawson, bassist Peter Oxley, keyboard player Alister Spence and brass arranger Eamon Dilworth as they tackle material from across Ed’s career.</p>",
        structuredEvent: { performers: [{ name: "Ed Kuepper" }] },
        eventData: {
          name: "The Exploding Universe of Ed Kuepper",
          artists: ["Ed Kuepper"]
        },
        venue
      })
    ).toEqual({
      artists: [
        "Ed Kuepper",
        "Mark Dawson",
        "Peter Oxley",
        "Alister Spence",
        "Eamon Dilworth"
      ],
      artistExtractionKind: "structured"
    });

    expect(
      extractMoshtixArtists({
        title: "Archive Retrospective",
        descriptionHtml:
          "<p>The group was joined by special guests Past Collaborator and Former Member in 2019.</p><p>The artist has collaborated with drummer Biography Name and bassist Another Name.</p>",
        structuredEvent: null,
        eventData: null,
        venue
      })
    ).toEqual({ artists: [], artistExtractionKind: "unknown" });
  });

  it("uses explicit Moshtix title presenters and exact credit-block headliners", () => {
    const venue = {
      name: "The Duke of George",
      slug: "the-duke-of-george",
      suburb: "East Fremantle",
      address: null,
      websiteUrl: null
    };

    expect(
      extractMoshtixArtists({
        title: "The Music of Steely Dan presented by No Static",
        descriptionHtml:
          "<p>The Music of Steely Dan presented by No Static</p><p>Bob Brisbane - Vocals Drums</p><p>Mike Collinson - Saxophone, Flute, vocals</p>",
        structuredEvent: null,
        eventData: null,
        venue
      })
    ).toEqual({
      artists: ["No Static", "Bob Brisbane", "Mike Collinson"],
      artistExtractionKind: "parsed_text"
    });
    expect(
      extractMoshtixArtists({
        title: "Alma Zygier",
        descriptionHtml:
          "<p>Alma Zygier</p><p>Harry Mitchell - Piano</p><p>Karl Florisson - Bass</p>",
        structuredEvent: null,
        eventData: null,
        venue
      })
    ).toEqual({
      artists: ["Alma Zygier", "Harry Mitchell", "Karl Florisson"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("does not treat ordinary dash-separated Moshtix prose as performer credits", () => {
    const extraction = extractMoshtixArtists({
      title: "Community Showcase",
      descriptionHtml:
        "<p>Doors - 6pm</p><p>Tickets — available now</p><p>The review - vocals were exceptional.</p><p>Jordan plays guitar throughout.</p>",
      structuredEvent: null,
      eventData: {
        name: "Community Showcase",
        artists: [],
        venue: { name: "The Duke of George" },
        client: { name: "The Duke of George" }
      },
      venue: {
        name: "The Duke of George",
        slug: "the-duke-of-george",
        suburb: "East Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: [],
      artistExtractionKind: "unknown"
    });
  });

  it("dedupes parenthetical tribute variants in Moshtix artist arrays", () => {
    const extraction = extractMoshtixArtists({
      title: "The Buzz Lovers (Nirvana Tribute) (Spain)",
      descriptionHtml: null,
      structuredEvent: {
        performers: [
          { name: "The Buzz Lovers" },
          { name: "The Buzz Lovers (Nirvana Tribute)" }
        ]
      },
      eventData: {
        name: "The Buzz Lovers (Nirvana Tribute) (Spain)",
        artists: ["The Buzz Lovers", "The Buzz Lovers (Nirvana Tribute)"],
        venue: {
          name: "Freo.Social"
        },
        client: {
          name: "Freo.Social"
        }
      },
      venue: {
        name: "Freo.Social",
        slug: "freo-social",
        suburb: "Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["The Buzz Lovers"],
      artistExtractionKind: "structured"
    });
  });

  it("keeps only the performer from Moshtix presenter-led tribute metadata", () => {
    const input = {
      title: "Howie Morgan presents Rodriguez Unplugged",
      descriptionHtml:
        "<p>Howie Morgan presents Rodriguez Unplugged</p><p>Join us for a celebration of Rodriguez.</p>",
      structuredEvent: {
        location: { name: "The Duke of George" },
        performers: [
          { name: "Duke Of George" },
          { name: "Howie Morgan presents Sugarman - The Best of Rodriguez" },
          { name: "Howie Morgan" },
          { name: "Sugarman" },
          { name: "The Duke of George" }
        ]
      },
      eventData: {
        name: "Howie Morgan presents Rodriguez Unplugged",
        artists: [
          "Duke Of George",
          "Howie Morgan presents Sugarman - The Best of Rodriguez  ",
          "Howie Morgan",
          "Sugarman",
          "The Duke of George"
        ],
        venue: { name: "The Duke of George" },
        client: { name: "The Duke Of George" }
      },
      venue: {
        name: "The Duke of George",
        slug: "the-duke-of-george",
        suburb: "East Fremantle",
        address: null,
        websiteUrl: null
      }
    };

    expect(extractMoshtixArtists(input)).toEqual({
      artists: ["Howie Morgan"],
      artistExtractionKind: "structured"
    });
    expect(
      moshtixWaSource.repairArtists?.({
        listing: { name: input.title },
        eventData: input.eventData,
        structuredEvent: input.structuredEvent,
        descriptionHtml: input.descriptionHtml
      })
    ).toEqual({
      artists: ["Howie Morgan"],
      artistExtractionKind: "structured"
    });
  });

  it.each([
    [
      "Courtney Murphy presents Boz ’n’ Billy: Silk Degrees and The Stranger - Live!",
      "Courtney Murphy"
    ],
    ["Darren Coggan presents \"Campfire\"", "Darren Coggan"],
    ["Louis Rebeiro presents 3 + 1", "Louis Rebeiro"]
  ])("parses person-led Moshtix show title %s", (title, artist) => {
    expect(
      extractMoshtixArtists({
        title,
        descriptionHtml: null,
        structuredEvent: {
          location: { name: "The Duke of George" },
          performers: [{ name: "The Duke of George" }]
        },
        eventData: {
          name: title,
          artists: ["Duke Of George", "The Duke of George"],
          venue: { name: "The Duke of George" },
          client: { name: "The Duke Of George" }
        },
        venue: {
          name: "The Duke of George",
          slug: "the-duke-of-george",
          suburb: "East Fremantle",
          address: null,
          websiteUrl: null
        }
      })
    ).toEqual({
      artists: [artist],
      artistExtractionKind: "parsed_text"
    });
  });

  it("does not treat an organization presenter as a Moshtix artist", () => {
    expect(
      extractMoshtixArtists({
        title:
          "WAYJO Presents Queer Anthems featuring Queency with the Resonance Jazz Orchestra",
        descriptionHtml: null,
        structuredEvent: {
          performers: [{ name: "Queency" }, { name: "Resonance Jazz Orchestra" }]
        },
        eventData: {
          name:
            "WAYJO Presents Queer Anthems featuring Queency with the Resonance Jazz Orchestra",
          artists: ["Queency", "Resonance Jazz Orchestra"],
          venue: { name: "The Rechabite" },
          client: { name: "WAYJO" }
        },
        venue: {
          name: "The Rechabite",
          slug: "the-rechabite",
          suburb: "Northbridge",
          address: null,
          websiteUrl: null
        }
      })
    ).toEqual({
      artists: ["Queency", "Resonance Jazz Orchestra"],
      artistExtractionKind: "structured"
    });
  });

  it("drops noisy Moshtix title support placeholders", () => {
    const extraction = extractMoshtixArtists({
      title: "Fever Dream with Alias Error + Special Guest TBA + Local Supports TBA + More",
      descriptionHtml: null,
      structuredEvent: null,
      eventData: {
        name: "Fever Dream with Alias Error + Special Guest TBA + Local Supports TBA + More",
        artists: [],
        venue: {
          name: "The Bird"
        },
        client: {
          name: "The Bird"
        }
      },
      venue: {
        name: "The Bird",
        slug: "the-bird",
        suburb: "Northbridge",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Fever Dream", "Alias Error"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("does not treat generic with titles as support lineups", () => {
    const extraction = extractMoshtixArtists({
      title: "An Evening with Alias Error",
      descriptionHtml: null,
      structuredEvent: null,
      eventData: {
        name: "An Evening with Alias Error",
        artists: [],
        venue: {
          name: "The Bird"
        },
        client: {
          name: "The Bird"
        }
      },
      venue: {
        name: "The Bird",
        slug: "the-bird",
        suburb: "Northbridge",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: [],
      artistExtractionKind: "unknown"
    });
  });

  it("parses labelled trio lineups from Moshtix titles and filters venue performers", () => {
    const extraction = extractMoshtixArtists({
      title: "MOONLIGHT AND LOVE SONGS with THE TRIO: Helen Shanahan, Allira Wilson and Jessie Gordon",
      descriptionHtml: null,
      structuredEvent: {
        location: {
          name: "The Duke of George"
        },
        performers: [
          { name: "Duke Of George" },
          { name: "The Duke of George" },
          { name: "Jessie Gordon" }
        ]
      },
      eventData: {
        name: "MOONLIGHT AND LOVE SONGS with THE TRIO: Helen Shanahan, Allira Wilson and Jessie Gordon",
        artists: ["Duke Of George", "The Duke of George", "Jessie Gordon"],
        venue: {
          name: "The Duke of George"
        },
        client: {
          name: "The Duke Of George"
        }
      },
      venue: {
        name: "The Duke of George",
        slug: "the-duke-of-george",
        suburb: "East Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Helen Shanahan", "Allira Wilson", "Jessie Gordon"],
      artistExtractionKind: "structured"
    });
  });

  it("filters Moshtix venue handles and redundant title-tour artist fragments", () => {
    const extraction = extractMoshtixArtists({
      title: "Kathleen Halloran 'Nobody’s Baby' Album Tour - Fremantle (Solo)",
      descriptionHtml: null,
      structuredEvent: {
        location: {
          name: "Mojos Bar, North Fremantle"
        },
        performers: [
          { name: "Mojos Bar" },
          { name: "Mojos Bar Homepage Gallery" },
          { name: "mojosbarwa" },
          { name: "Kathleen Halloran" }
        ]
      },
      eventData: {
        name: "Kathleen Halloran 'Nobody’s Baby' Album Tour - Fremantle (Solo)",
        artists: [
          "Mojos Bar",
          "Mojos Bar Homepage Gallery",
          "mojosbarwa",
          "Kathleen Halloran"
        ],
        venue: {
          name: "Mojos Bar, North Fremantle"
        },
        client: {
          name: "Mojo's Bar"
        }
      },
      venue: {
        name: "Mojos Bar",
        slug: "mojos-bar",
        suburb: "North Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Kathleen Halloran"],
      artistExtractionKind: "structured"
    });
  });

  it("parses played-by tribute performers instead of Moshtix venue placeholders", () => {
    const extraction = extractMoshtixArtists({
      title: "GORILLAZ: Demon Days Album + Greatest Hits Played By Last Living Souls.",
      descriptionHtml: null,
      structuredEvent: {
        location: {
          name: "Freo.Social"
        },
        performers: [{ name: "Freo Social" }]
      },
      eventData: {
        name: "GORILLAZ: Demon Days Album + Greatest Hits Played By Last Living Souls.",
        artists: ["Freo Social"],
        venue: {
          name: "Freo.Social"
        },
        client: {
          name: "Freo Social"
        }
      },
      venue: {
        name: "Freo.Social",
        slug: "freo-social",
        suburb: "Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Last Living Souls"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("parses featured headliners and support names from Moshtix concert copy", () => {
    const extraction = extractMoshtixArtists({
      title: "Remembering The Strike; featuring Shane Howard (Goanna Band) and more!",
      descriptionHtml:
        "<p>Headlined by Shane Howard with his Great Western band made up of Fremantle musicians Lucky Oceans, David Hyams, Roy Martinez and Todd Pickett.</p>",
      structuredEvent: null,
      eventData: {
        name: "Remembering The Strike; featuring Shane Howard (Goanna Band) and more!",
        artists: [],
        venue: {
          name: "Freo.Social"
        },
        client: {
          name: "Freo.Social"
        }
      },
      venue: {
        name: "Freo.Social",
        slug: "freo-social",
        suburb: "Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Shane Howard", "Lucky Oceans", "David Hyams", "Roy Martinez", "Todd Pickett"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("parses bare ft. and featuring performers from Moshtix titles", () => {
    const baseInput = {
      descriptionHtml: null,
      structuredEvent: null,
      eventData: {
        artists: [],
        venue: {
          name: "The Rechabite"
        },
        client: {
          name: "The Rechabite"
        }
      },
      venue: {
        name: "The Rechabite",
        slug: "the-rechabite",
        suburb: "Northbridge",
        address: null,
        websiteUrl: null
      }
    };

    expect(
      extractMoshtixArtists({
        ...baseInput,
        title: "THC ft. Houseology DJ's"
      })
    ).toEqual({
      artists: ["Houseology DJ's"],
      artistExtractionKind: "parsed_text"
    });
    expect(
      extractMoshtixArtists({
        ...baseInput,
        title: "Flamenco Experience featuring Bernard van Rossum"
      })
    ).toEqual({
      artists: ["Bernard van Rossum"],
      artistExtractionKind: "parsed_text"
    });
    expect(
      extractMoshtixArtists({
        ...baseInput,
        title:
          "WAYJO Presents Queer Anthems featuring Queency with the Resonance Jazz Orchestra"
      })
    ).toEqual({
      artists: ["Queency", "Resonance Jazz Orchestra"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("parses DJ artists from Moshtix venue-session descriptions", () => {
    const listing = parseMoshtixSearchPage(
      buildSearchPage({
        results: [
          buildSearchResult({
            eventId: "193929",
            title: "VINYL LOUNGE at the Duke",
            eventUrl: "https://www.moshtix.com.au/v2/event/vinyl-lounge-at-the-duke/193929",
            imageUrl: "https://static.moshtix.com.au/uploads/vinyl-loungex140x140",
            startDate: "2026-04-25T13:00:00",
            endDate: "2026-04-25T17:00:00",
            venueName: "The Duke of George",
            streetAddress: "135 Duke Street",
            locality: "East Fremantle"
          })
        ]
      })
    ).listings[0];

    const gig = normalizeMoshtixEventPage({
      listing,
      html: buildEventPage({
        eventId: "193929",
        title: "VINYL LOUNGE at the Duke",
        eventUrl: listing.eventUrl,
        startDate: "2026-04-25T13:00:00",
        endDate: "2026-04-25T17:00:00",
        venueName: "The Duke of George",
        streetAddress: "135 Duke Street",
        locality: "East Fremantle",
        region: "WA",
        postalCode: "6158",
        descriptionHtml:
          "<p>DJ Howie Z launches the Saturday Vinyl Lounge Sessions!</p><p>Free Entry and Tunes from 1 pm to 5 pm</p>",
        artists: []
      })
    });

    expect(gig.artists).toEqual(["DJ Howie Z"]);
    expect(gig.artistExtractionKind).toBe("parsed_text");
  });

  it("parses Moshtix DJ schedule lines without keeping set times", () => {
    const extraction = extractMoshtixArtists({
      title: "Club 237",
      descriptionHtml:
        "<p>CLUB 237 LAUNCH PARTY!</p><p>DJS: 🖤 Anne Love: PRE-PARTY 8-9PM 🖤 Anne Love: 9-10PM 🖤 Swangin: 10-11PM 🖤 Cue: 11-12AM 🖤 Buff Baby: 12-1AM 🖤 Ramoe: 1-2AM 🖤 Sal: 2-CLOSE</p>",
      structuredEvent: null,
      eventData: {
        name: "Club 237",
        artists: [],
        venue: {
          name: "Destination"
        },
        client: {
          name: "Destination (formerly Barbes)"
        }
      },
      venue: {
        name: "Destination",
        slug: "destination",
        suburb: "Northbridge",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Anne Love", "Swangin", "Cue", "Buff Baby", "Ramoe", "Sal"],
      artistExtractionKind: "parsed_text"
    });
  });

});
