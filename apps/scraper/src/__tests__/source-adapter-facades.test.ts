import { describe, expect, it } from "vitest";

import * as humanitixFacade from "../sources/humanitix-perth-music";
import * as humanitixParser from "../sources/humanitix-perth-music/parser";
import { humanitixPerthMusicSource } from "../sources/humanitix-perth-music/source";
import * as moshtixFacade from "../sources/moshtix-wa";
import * as moshtixParser from "../sources/moshtix-wa/parser";
import { moshtixWaSource } from "../sources/moshtix-wa/source";
import * as oztixFacade from "../sources/oztix-wa";
import * as oztixParser from "../sources/oztix-wa/parser";
import { oztixWaSource } from "../sources/oztix-wa/source";
import * as ticketekFacade from "../sources/ticketek-wa";
import * as ticketekParser from "../sources/ticketek-wa/parser";
import { ticketekWaSource } from "../sources/ticketek-wa/source";
import * as birdFacade from "../sources/the-bird";
import * as birdParser from "../sources/the-bird/parser";
import { theBirdSource } from "../sources/the-bird/source";

describe("source adapter compatibility facades", () => {
  it("preserves Humanitix runtime exports", () => {
    expect(Object.keys(humanitixFacade).sort()).toEqual([
      "extractHumanitixArtists",
      "humanitixPerthMusicSource",
      "normalizeHumanitixDetailPage",
      "parseHumanitixDiscoveryPage"
    ]);
    expect(humanitixFacade.extractHumanitixArtists).toBe(
      humanitixParser.extractHumanitixArtists
    );
    expect(humanitixFacade.normalizeHumanitixDetailPage).toBe(
      humanitixParser.normalizeHumanitixDetailPage
    );
    expect(humanitixFacade.parseHumanitixDiscoveryPage).toBe(
      humanitixParser.parseHumanitixDiscoveryPage
    );
    expect(humanitixFacade.humanitixPerthMusicSource).toBe(humanitixPerthMusicSource);
  });

  it("preserves Moshtix runtime exports", () => {
    expect(Object.keys(moshtixFacade).sort()).toEqual([
      "buildMoshtixWaSearchUrl",
      "extractMoshtixArtists",
      "moshtixWaSource",
      "normalizeMoshtixEventPage",
      "parseMoshtixSearchPage"
    ]);
    expect(moshtixFacade.buildMoshtixWaSearchUrl).toBe(
      moshtixParser.buildMoshtixWaSearchUrl
    );
    expect(moshtixFacade.extractMoshtixArtists).toBe(
      moshtixParser.extractMoshtixArtists
    );
    expect(moshtixFacade.normalizeMoshtixEventPage).toBe(
      moshtixParser.normalizeMoshtixEventPage
    );
    expect(moshtixFacade.parseMoshtixSearchPage).toBe(
      moshtixParser.parseMoshtixSearchPage
    );
    expect(moshtixFacade.moshtixWaSource).toBe(moshtixWaSource);
  });

  it("preserves Oztix runtime exports used by Rosemount", () => {
    expect(Object.keys(oztixFacade).sort()).toEqual([
      "extractOztixArtists",
      "isMusicGigHit",
      "isPerthMetroHit",
      "normalizeOztixHit",
      "normalizeOztixTitle",
      "oztixWaSource",
      "parseOztixDescriptionArtists",
      "parseOztixHits",
      "parseOztixSpecialGuests",
      "parseOztixTitleFeaturedArtists",
      "parseOztixTitleHeadlinerArtists",
      "parseOztixTitleLineupArtists",
      "parseOztixTitlePresentedArtists",
      "parseOztixTitleTrailingWithArtists",
      "selectPreferredImageUrl"
    ]);
    expect(oztixFacade.extractOztixArtists).toBe(oztixParser.extractOztixArtists);
    expect(oztixFacade.parseOztixHits).toBe(oztixParser.parseOztixHits);
    expect(oztixFacade.normalizeOztixHit).toBe(oztixParser.normalizeOztixHit);
    expect(oztixFacade.oztixWaSource).toBe(oztixWaSource);
  });

  it("preserves Ticketek runtime exports", () => {
    expect(Object.keys(ticketekFacade).sort()).toEqual([
      "buildTicketekExactTimeLookupKey",
      "mergeTicketekSearchApiResponseIntoExactTimeLookup",
      "normalizeTicketekListing",
      "parseTicketekSearchPage",
      "ticketekWaSource"
    ]);
    expect(ticketekFacade.buildTicketekExactTimeLookupKey).toBe(
      ticketekParser.buildTicketekExactTimeLookupKey
    );
    expect(ticketekFacade.mergeTicketekSearchApiResponseIntoExactTimeLookup).toBe(
      ticketekParser.mergeTicketekSearchApiResponseIntoExactTimeLookup
    );
    expect(ticketekFacade.normalizeTicketekListing).toBe(
      ticketekParser.normalizeTicketekListing
    );
    expect(ticketekFacade.parseTicketekSearchPage).toBe(
      ticketekParser.parseTicketekSearchPage
    );
    expect(ticketekFacade.ticketekWaSource).toBe(ticketekWaSource);
  });

  it("preserves The Bird runtime exports", () => {
    expect(Object.keys(birdFacade).sort()).toEqual([
      "extractTheBirdLinkedImageUrl",
      "normalizeTheBirdLinkedEventUrl",
      "normalizeTheBirdRow",
      "normalizeTheBirdWhatsOnRow",
      "parseTheBirdFeaturingArtists",
      "parseTheBirdFeedRows",
      "parseTheBirdInfoArtists",
      "parseTheBirdStartTime",
      "parseTheBirdWhatsOnRows",
      "theBirdSource"
    ]);
    expect(birdFacade.normalizeTheBirdRow).toBe(birdParser.normalizeTheBirdRow);
    expect(birdFacade.parseTheBirdFeedRows).toBe(birdParser.parseTheBirdFeedRows);
    expect(birdFacade.theBirdSource).toBe(theBirdSource);
  });
});
