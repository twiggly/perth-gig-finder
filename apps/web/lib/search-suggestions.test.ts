import { describe, expect, it } from "vitest";

import { buildAutocompleteSuggestions } from "./search-suggestions";

describe("buildAutocompleteSuggestions", () => {
  const gigs = [
    {
      title: "Sly Withers – Album Release Party",
      artist_names: ["Sly Withers", "Amelia Day"],
      venue_name: "Mojos Bar",
      venue_slug: "mojos-bar",
      venue_suburb: "North Fremantle"
    },
    {
      title: "Busy Being in Love Launch",
      artist_names: ["Sophie Lilah", "Fox India"],
      venue_name: "Milk Bar",
      venue_slug: "milk-bar",
      venue_suburb: "Inglewood"
    }
  ];

  const venues = [
    {
      slug: "mojos-bar",
      name: "Mojos Bar",
      suburb: "North Fremantle"
    },
    {
      slug: "milk-bar",
      name: "Milk Bar",
      suburb: "Inglewood"
    }
  ];

  it("returns gigs, artists, and venues ranked by match strength", () => {
    expect(buildAutocompleteSuggestions("moj", gigs, venues)).toEqual([
      {
        type: "venue",
        label: "Mojos Bar",
        slug: "mojos-bar",
        subtext: "North Fremantle",
        icon: "venue"
      }
    ]);

    expect(buildAutocompleteSuggestions("sly", gigs, venues)).toEqual([
      {
        type: "gig",
        label: "Sly Withers – Album Release Party",
        query: "Sly Withers – Album Release Party",
        subtext: "Mojos Bar · North Fremantle",
        icon: "gig"
      },
      {
        type: "artist",
        label: "Sly Withers",
        query: "Sly Withers",
        subtext: "Mojos Bar · North Fremantle",
        icon: "artist"
      }
    ]);
  });

  it("deduplicates repeated artist and venue matches", () => {
    const duplicateGigs = [
      ...gigs,
      {
        title: "Sly Withers DJ Set",
        artist_names: ["Sly Withers"],
        venue_name: "Mojos Bar",
        venue_slug: "mojos-bar",
        venue_suburb: "North Fremantle"
      }
    ];

    expect(
      buildAutocompleteSuggestions("sly withers", duplicateGigs, venues).filter(
        (suggestion) => suggestion.type === "artist"
      )
    ).toHaveLength(1);
  });
});
