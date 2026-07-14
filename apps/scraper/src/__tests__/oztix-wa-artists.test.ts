import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  extractOztixArtists,
  isMusicGigHit,
  isPerthMetroHit,
  normalizeOztixHit,
  oztixWaSource,
  parseOztixDescriptionArtists,
  parseOztixSpecialGuests,
  parseOztixTitleHeadlinerArtists,
  parseOztixHits,
  parseOztixTitleFeaturedArtists,
  parseOztixTitleLineupArtists,
  parseOztixTitlePresentedArtists,
  parseOztixTitleTrailingWithArtists
} from "../sources/oztix-wa";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures");


describe("oztix wa artist extraction", () => {
  it("parses special guest lineups from Oztix guest text", () => {
    expect(
      parseOztixSpecialGuests(
        'starring VOODOO PEOPLE - RENEGADES OF ROCK - THE BROWN STUDY BAND - SCAR TISSUE'
      )
    ).toEqual([
      "VOODOO PEOPLE",
      "RENEGADES OF ROCK",
      "THE BROWN STUDY BAND",
      "SCAR TISSUE"
    ]);

    expect(
      parseOztixSpecialGuests(
        "with special guests, The Aquabats! and The Suicide Machines"
      )
    ).toEqual(["The Aquabats!", "The Suicide Machines"]);

    expect(parseOztixSpecialGuests("With BLESSTHEFALL")).toEqual(["BLESSTHEFALL"]);
    expect(parseOztixSpecialGuests("with DJ SWEETMAN")).toEqual(["DJ SWEETMAN"]);
    expect(parseOztixSpecialGuests("w/ Saving Face")).toEqual(["Saving Face"]);
    expect(parseOztixSpecialGuests("w/Saving Face")).toEqual(["Saving Face"]);
    expect(
      parseOztixSpecialGuests("Sleepy Soph; Bella Dyer; Jessica Blackley")
    ).toEqual(["Sleepy Soph", "Bella Dyer", "Jessica Blackley"]);
    expect(parseOztixSpecialGuests("with a special guest to be announced")).toEqual([]);
    expect(parseOztixSpecialGuests("special guest to be announced")).toEqual([]);
    expect(parseOztixSpecialGuests("Specials guests to be announced!")).toEqual([]);
    expect(
      parseOztixSpecialGuests("with specials guests Actual Artist")
    ).toEqual(["Actual Artist"]);
    expect(parseOztixSpecialGuests("guest TBA")).toEqual([]);
    expect(parseOztixSpecialGuests("Supports to be announced")).toEqual([]);
    expect(parseOztixSpecialGuests("support acts TBA")).toEqual([]);
    expect(parseOztixSpecialGuests("Local Supports TBA")).toEqual([]);
    expect(parseOztixSpecialGuests("Secret Act")).toEqual([]);
    expect(parseOztixSpecialGuests("Mystery Guest")).toEqual([]);
    expect(parseOztixSpecialGuests("MORE!")).toEqual([]);

    expect(
      parseOztixSpecialGuests(
        "With Beddy Rays, Teenage Joans, Daily J, Bootleg Rascal, Secret Act, Vlads + MORE!"
      )
    ).toEqual(["Beddy Rays", "Teenage Joans", "Daily J", "Bootleg Rascal", "Vlads"]);

    expect(
      parseOztixSpecialGuests("OBSCURA (GER) FALLUJAH (USA)^ ASHEN (WA) + ANOXIA (NSW)")
    ).toEqual(["OBSCURA (GER)", "FALLUJAH (USA)", "ASHEN (WA)", "ANOXIA (NSW)"]);

    expect(parseOztixSpecialGuests("with guests TBC")).toEqual([]);
    expect(parseOztixSpecialGuests("plus special guests")).toEqual([]);
    expect(parseOztixSpecialGuests("The Specials")).toEqual(["The Specials"]);
    expect(parseOztixSpecialGuests("more TBC")).toEqual([]);
    expect(
      parseOztixSpecialGuests("Everything Around You Tour with Special Guest Codee-lee")
    ).toEqual(["Codee-lee"]);
    expect(parseOztixSpecialGuests("Neil Fernandes • Greg Dear • Perth Folk")).toEqual([
      "Neil Fernandes",
      "Greg Dear",
      "Perth Folk"
    ]);
    expect(parseOztixSpecialGuests("Bat Soup, Misery Inc. & Zaria")).toEqual([
      "Bat Soup",
      "Misery Inc",
      "Zaria"
    ]);
    expect(
      parseOztixSpecialGuests(
        "With Chaos Surfers, Jewels and Bullets, Awkward Moments, Urban Hymns, & Bat Soup"
      )
    ).toEqual([
      "Chaos Surfers",
      "Jewels",
      "Bullets",
      "Awkward Moments",
      "Urban Hymns",
      "Bat Soup"
    ]);
    expect(
      parseOztixSpecialGuests("Artist One, Artist Two, & Artist Three")
    ).toEqual(["Artist One", "Artist Two", "Artist Three"]);
    expect(
      parseOztixSpecialGuests("Artist One, Artist Two, and Artist Three")
    ).toEqual(["Artist One", "Artist Two", "Artist Three"]);
    expect(parseOztixSpecialGuests("CNTR & Somerly")).toEqual(["CNTR", "Somerly"]);
    expect(parseOztixSpecialGuests("with Pontianak & MOT1SS")).toEqual([
      "Pontianak",
      "MOT1SS"
    ]);
    expect(parseOztixSpecialGuests("CoCo & The VOH Dancers")).toEqual([
      "CoCo & The VOH Dancers"
    ]);
    expect(
      parseOztixSpecialGuests("with special guests Ghost Care & Hey So Hungry")
    ).toEqual(["Ghost Care", "Hey So Hungry"]);
    expect(
      parseOztixSpecialGuests("with special guest Rated R (Rammstein Tribute)")
    ).toEqual(["Rated R"]);
    expect(
      parseOztixSpecialGuests("Cicada (Debut Show), Chalked, Top Secret Guest")
    ).toEqual(["Cicada", "Chalked"]);
    expect(
      parseOztixSpecialGuests(
        "Augmented Fifth. Brad F. BRGN. LOST ETHER. OTRUTA. Ríain"
      )
    ).toEqual(["Augmented Fifth", "Brad F", "BRGN", "LOST ETHER", "OTRUTA", "Ríain"]);
    expect(
      parseOztixSpecialGuests(
        "Emotion Sickness & Chemically Disheartened with Phoenix Nights"
      )
    ).toEqual(["Emotion Sickness", "Chemically Disheartened", "Phoenix Nights"]);
    expect(
      parseOztixSpecialGuests("Elise Lynelle. Support from Your Girl Persia.")
    ).toEqual(["Elise Lynelle", "Your Girl Persia"]);
    expect(
      parseOztixSpecialGuests(
        "POGUE MAHONE - TRIBUTE TO THE POGUES & SALV DI CRISCITO (Solo - Nirvana Unplugged)"
      )
    ).toEqual(["POGUE MAHONE", "SALV DI CRISCITO"]);
    expect(parseOztixSpecialGuests("FRIDAY FRIGHT NIGHT")).toEqual([]);
    expect(
      parseOztixSpecialGuests(
        "STEVE SIMMONS + LAINEY WILSON TRIBUTE SET + DJ + MC HOLLY DENTON"
      )
    ).toEqual(["STEVE SIMMONS", "MC HOLLY DENTON"]);
    expect(parseOztixSpecialGuests("Jolie, Band, Maira Trindade, DJ Glaucio")).toEqual([
      "Jolie",
      "Maira Trindade",
      "DJ Glaucio"
    ]);
  });

  it("parses only explicitly labelled Oztix description lineups", () => {
    expect(
      parseOztixDescriptionArtists(`
        <p>All shows will be supported by <strong>Sammi Heaney,</strong> with New Zealand's show featuring another local act.</p>
        <p>Featuring live performances from <strong>Brian Finn, Keelan Rivers, and Foreign Sons</strong>, this promises to be a fantastic night.</p>
        <p>With special guests CNTR &amp; Lefty</p>
        <p>?? <strong>Live: Banda Candela + DJs</strong></p>
      `)
    ).toEqual([
      "Sammi Heaney",
      "Brian Finn",
      "Keelan Rivers",
      "Foreign Sons",
      "CNTR",
      "Lefty",
      "Banda Candela"
    ]);

    expect(
      parseOztixDescriptionArtists(
        "Join Nyamaha, Magpie Senpai, No Motif, Chromakey and Kyawaii as they take over the stage."
      )
    ).toEqual(["Nyamaha", "Magpie Senpai", "No Motif", "Chromakey", "Kyawaii"]);
    expect(
      parseOztixDescriptionArtists(
        "Join WAYJO in celebrating and supporting these artists as they develop their craft."
      )
    ).toEqual([]);
    expect(
      parseOztixDescriptionArtists(
        "The tour was proudly supported by Double J and community partners."
      )
    ).toEqual([]);
    expect(
      extractOztixArtists({
        EventName: "J-Rock Live House 2026",
        EventDescription:
          "Join Nyamaha, Magpie Senpai, No Motif, Chromakey and Kyawaii as they take over the stage.",
        SpecialGuests:
          "with special guests Magpie Senpai, No Motif, Chromakey & Kyawaii"
      }).artists
    ).toEqual(["Nyamaha", "Magpie Senpai", "No Motif", "Chromakey", "Kyawaii"]);
  });

  it("extracts current performers from an explicit Oztix launch billing sentence", () => {
    const EventDescription = [
      "<p>Perth singer-songwriter Ben William will celebrate the release of his newest album.</p>",
      "<p>The album launch will also feature Perth singer-songwriter Anna Dabbs and alternative R&amp;B/ electronic neo-soul band Shadow Planet, celebrating the diversity of Perth music.</p>"
    ].join("");

    expect(parseOztixDescriptionArtists(EventDescription)).toEqual([
      "Anna Dabbs",
      "Shadow Planet"
    ]);
    expect(
      extractOztixArtists({
        EventName: "Ben William - Imitate Album Launch",
        EventDescription,
        Bands: [],
        Performances: []
      })
    ).toEqual({
      artists: ["Ben William", "Anna Dabbs", "Shadow Planet"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("extracts bounded event lineups without treating band-member rosters as artists", () => {
    const EventDescription = [
      "<p>ARMAGEDDOOM 8 LINE UP</p>",
      "<p>Candlemass (SWE)</p>",
      "<p>Mammons Throne (VIC) – First time ever in Perth</p>",
      "<p>Twin Serpents</p>",
      "<p>Ashen</p>",
      "<p>Rockys Pride and Joy (SA) – First time ever in Perth</p>",
      "<p>Guild</p>",
      "<p>More About these bands below!</p>",
      "<p>CANDLEMASS – Current Line-Up</p>",
      "<p>Leif Edling – Bass</p>",
      "<p>Johan Länquist – Vocals</p>"
    ].join("");
    const expectedExtraction = {
      artists: [
        "Candlemass",
        "Mammons Throne",
        "Twin Serpents",
        "Ashen",
        "Rockys Pride and Joy",
        "Guild"
      ],
      artistExtractionKind: "structured" as const
    };

    expect(
      parseOztixDescriptionArtists(
        "<p>CANDLEMASS – Current Line-Up</p><p>Leif Edling – Bass</p><p>Johan Länquist – Vocals</p>"
      )
    ).toEqual([]);
    expect(
      extractOztixArtists({
        EventName: "ARMAGEDOOM VIII ft. Candlemass (SWE)",
        EventDescription,
        Bands: ["Candlemass"],
        Performances: []
      })
    ).toEqual(expectedExtraction);
    expect(
      oztixWaSource.repairArtists?.({
        EventName: "ARMAGEDOOM VIII ft. Candlemass (SWE)",
        EventDescription,
        Bands: ["Candlemass"],
        Performances: []
      })
    ).toEqual(expectedExtraction);
  });

  it("uses parsed special guests when Oztix has no structured artist arrays", () => {
    expect(
      extractOztixArtists({
        EventName: "FREOPALOOZA",
        SpecialGuests:
          'starring VOODOO PEOPLE - RENEGADES OF ROCK - THE BROWN STUDY BAND - SCAR TISSUE',
        Bands: [],
        Performances: []
      })
    ).toEqual({
      artists: [
        "VOODOO PEOPLE",
        "RENEGADES OF ROCK",
        "THE BROWN STUDY BAND",
        "SCAR TISSUE"
      ],
      artistExtractionKind: "parsed_text"
    });

    expect(
      extractOztixArtists({
        EventName: '"Velvet Grooves"',
        SpecialGuests:
          "feat. Slack Rapids + Adam Lebransky + Clean Tones + Spatula City",
        EventDescription:
          "Velvet Grooves featuring Slack Rapids, Adam Lebransky, Clean Tones and Spatula City.",
        Bands: [],
        Performances: []
      })
    ).toEqual({
      artists: ["Slack Rapids", "Adam Lebransky", "Clean Tones", "Spatula City"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("does not treat Oztix theme labels as artists", () => {
    expect(
      extractOztixArtists({
        EventName: "HORNOGRAPHY",
        SpecialGuests: "FRIDAY FRIGHT NIGHT",
        Bands: [],
        Performances: []
      })
    ).toEqual({
      artists: [],
      artistExtractionKind: "unknown"
    });
  });

  it("adds parsed support acts to structured Oztix headliners", () => {
    expect(
      extractOztixArtists({
        EventName: "Less Than Jake - 'Circus Down Under' Tour",
        Bands: ["Less Than Jake"],
        Performances: [{ Name: "Less Than Jake" }],
        SpecialGuests: "with special guests, The Aquabats! and The Suicide Machines"
      })
    ).toEqual({
      artists: ["Less Than Jake", "The Aquabats!", "The Suicide Machines"],
      artistExtractionKind: "structured"
    });

    expect(
      extractOztixArtists({
        EventName: "Felicity Urquhart & Josh Cunningham",
        Bands: ["Felicity Urquhart", "Josh Cunningham"],
        Performances: [
          { Name: "Felicity Urquhart" },
          { Name: "Josh Cunningham" }
        ],
        SpecialGuests: "Everything Around You Tour with Special Guest Codee-lee"
      })
    ).toEqual({
      artists: ["Felicity Urquhart", "Josh Cunningham", "Codee-lee"],
      artistExtractionKind: "structured"
    });

    expect(
      extractOztixArtists({
        EventName: "Jessica Blackley More Than This Single Launch",
        Bands: ["Jessica Blackley"],
        Performances: [],
        SpecialGuests: "Sleepy Soph; Bella Dyer; Jessica Blackley"
      })
    ).toEqual({
      artists: ["Jessica Blackley", "Sleepy Soph", "Bella Dyer"],
      artistExtractionKind: "structured"
    });

    expect(
      extractOztixArtists({
        EventName: "(Artificial) Nights band launch",
        Bands: ["(Artificial) Nights"],
        Performances: [],
        SpecialGuests:
          "(Artificial) Nights; Lake Mammoth; Stack of Bibles; Indi Steedman"
      })
    ).toEqual({
      artists: [
        "(Artificial) Nights",
        "Lake Mammoth",
        "Stack of Bibles",
        "Indi Steedman"
      ],
      artistExtractionKind: "structured"
    });
  });

  it("does not split semicolon-delimited event description prose into artists", () => {
    expect(
      extractOztixArtists({
        EventName: "Community Showcase",
        Bands: [],
        Performances: [],
        SpecialGuests: "",
        EventDescription:
          "Doors open at seven; food is available; arrive early for the best seats."
      })
    ).toEqual({
      artists: [],
      artistExtractionKind: "unknown"
    });
  });

  it("repairs semicolon-separated Oztix special guests from stored payloads", () => {
    expect(
      oztixWaSource.repairArtists?.({
        EventName: "Jessica Blackley More Than This Single Launch",
        Bands: ["Jessica Blackley"],
        Performances: [],
        SpecialGuests: "Sleepy Soph; Bella Dyer; Jessica Blackley"
      })
    ).toEqual({
      artists: ["Jessica Blackley", "Sleepy Soph", "Bella Dyer"],
      artistExtractionKind: "structured"
    });
  });

  it("repairs Oxford-conjunction Oztix lineups from stored payloads", () => {
    expect(
      oztixWaSource.repairArtists?.({
        EventName: "Jam Night Anthems",
        Bands: [],
        Performances: [],
        SpecialGuests:
          "With Chaos Surfers, Jewels and Bullets, Awkward Moments, Urban Hymns, & Bat Soup"
      })
    ).toEqual({
      artists: [
        "Chaos Surfers",
        "Jewels",
        "Bullets",
        "Awkward Moments",
        "Urban Hymns",
        "Bat Soup"
      ],
      artistExtractionKind: "parsed_text"
    });
  });

  it("does not re-add duplicate composite special-guest text when structured artists are present", () => {
    expect(
      extractOztixArtists({
        EventName: "The Kid fez supported by GR33DY GR33N & Lill Miss JoJo",
        Bands: ["The Kid Fez", "GR33DY GR33N", "Lill Miss JoJo"],
        Performances: [
          { Name: "The Kid Fez" },
          { Name: "GR33DY GR33N" },
          { Name: "Lill Miss JoJo" }
        ],
        SpecialGuests: "Lill Miss JoJo, Greedy Green & The Kid Fez"
      })
    ).toEqual({
      artists: ["The Kid Fez", "GR33DY GR33N", "Lill Miss JoJo"],
      artistExtractionKind: "structured"
    });

    expect(
      extractOztixArtists({
        EventName: "Adele Oliver & Jacob Vincent (QLD)",
        Bands: ["Adele Oliver", "Jacob Vincent"],
        Performances: [{ Name: "Adele Oliver" }, { Name: "Jacob Vincent" }],
        SpecialGuests: "Adele Oliver & Jacob Vincent (QLD)"
      })
    ).toEqual({
      artists: ["Adele Oliver", "Jacob Vincent"],
      artistExtractionKind: "structured"
    });
  });

  it("cleans parsed support prefixes without dropping structured headliners", () => {
    expect(
      extractOztixArtists({
        EventName: "Sienna Skies \"Australian Spring Tour\"",
        Bands: ["Sienna Skies"],
        Performances: [{ Name: "Sienna Skies" }],
        SpecialGuests: "w/ Saving Face"
      })
    ).toEqual({
      artists: ["Sienna Skies", "Saving Face"],
      artistExtractionKind: "structured"
    });
  });

  it("parses narrow quoted-tour title headliners when Oztix omits structured artists", () => {
    expect(
      parseOztixTitleHeadlinerArtists('Sienna Skies "Australian Spring Tour"')
    ).toEqual(["Sienna Skies"]);
    expect(
      parseOztixTitleHeadlinerArtists(
        "Rock Wax Thursdays - 60 Years of Bob Dylan's 'Blonde on Blonde'"
      )
    ).toEqual([]);

    expect(
      extractOztixArtists({
        EventName: 'Sienna Skies "Australian Spring Tour"',
        Bands: [],
        Performances: [],
        SpecialGuests: "w/ Saving Face + Local Supports TBA"
      })
    ).toEqual({
      artists: ["Sienna Skies", "Saving Face"],
      artistExtractionKind: "parsed_text"
    });

    expect(
      extractOztixArtists({
        EventName: "Tim Schilperoort - Maybe - Single Launch",
        Bands: ["Tim Schilperoort"],
        Performances: [{ Name: "Tim Schilperoort" }],
        SpecialGuests: "with special guests Anika Louise + more TBC"
      })
    ).toEqual({
      artists: ["Tim Schilperoort", "Anika Louise"],
      artistExtractionKind: "structured"
    });
  });

  it("parses a trailing co-billed artist only from quoted tour titles", () => {
    expect(
      parseOztixTitleTrailingWithArtists(
        "TO THE GRAVE 'NAIL AUSTRALIA TO THE WALLS' with NO CURE (USA)"
      )
    ).toEqual(["NO CURE"]);
    expect(parseOztixTitleTrailingWithArtists("An Evening with Kristin Hersh")).toEqual(
      []
    );
  });

  it("reassembles title-exact band names split by structured Oztix metadata", () => {
    expect(
      extractOztixArtists({
        EventName: "Michael Vdelli and the Art of Dysfunction + Blue Shaddy",
        Bands: ["Blue Shaddy", "Art of Dysfunction", "Michael Vdelli"]
      }).artists
    ).toEqual(["Michael Vdelli and the Art of Dysfunction", "Blue Shaddy"]);
  });

  it("deduplicates title-corroborated short and full band aliases", () => {
    expect(
      extractOztixArtists({
        EventName:
          "John Farnham and Little River Band performed by Reminiscing Band",
        Bands: ["Reminiscing", "Reminiscing Band"]
      }).artists
    ).toEqual(["Reminiscing Band"]);

    expect(
      extractOztixArtists({
        EventName: "Matt Angell & the Gold Diggers w/ Klaxon Hymn",
        Bands: ["Matt Angell", "Matt Angell & the Gold Diggers"],
        SpecialGuests: "with Klaxon Hymn"
      }).artists
    ).toEqual(["Matt Angell & the Gold Diggers", "Klaxon Hymn"]);
  });

  it("parses narrow release-launch headliners and keeps explicit supports", () => {
    expect(parseOztixTitleHeadlinerArtists('Diamond Sky "Outlaw City" Single Launch')).toEqual([
      "Diamond Sky"
    ]);
    expect(parseOztixTitleHeadlinerArtists("Ben William - Imitate Album Launch")).toEqual([
      "Ben William"
    ]);
    expect(
      extractOztixArtists({
        EventName: 'Diamond Sky "Outlaw City" Single Launch',
        Bands: [],
        Performances: [],
        SpecialGuests: "ft. Electric State, Black Kanyon & Ashes of Autumn"
      })
    ).toEqual({
      artists: ["Diamond Sky", "Electric State", "Black Kanyon", "Ashes of Autumn"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("keeps structured conjunction names and orders exact co-headliners from titles", () => {
    expect(
      extractOztixArtists({
        EventName: "Winston and the New Age",
        Bands: ["Winston and the New Age"],
        Performances: [],
        SpecialGuests: "Jonny P, Crystal Maxwell"
      }).artists
    ).toEqual(["Winston and the New Age", "Jonny P", "Crystal Maxwell"]);

    expect(
      extractOztixArtists({
        EventName: "Macseal + Prince Daddy & The Hyena Australian Tour 2026",
        Bands: ["Prince Daddy & The Hyena", "Macseal"],
        Performances: [],
        SpecialGuests: "with About Yesterday"
      }).artists
    ).toEqual(["Macseal", "Prince Daddy & The Hyena", "About Yesterday"]);
  });

  it("prefers exact title display names and ignores broad title fragments when guests exist", () => {
    expect(
      extractOztixArtists({
        EventName: "HEALTH AUSTRALIA 2.0.2.6.",
        Bands: ["health"],
        Performances: [],
        SpecialGuests: "with PERTURBATOR & KING YOSEF"
      }).artists
    ).toEqual(["HEALTH", "PERTURBATOR", "KING YOSEF"]);
    expect(
      extractOztixArtists({
        EventName:
          "Rock Wax Thursdays - Stairway to Led Zeppelin - Spinning Zeppelin, Sabbath & More",
        Bands: [],
        Performances: [],
        SpecialGuests: "with DJ SWEETMAN"
      }).artists
    ).toEqual(["DJ SWEETMAN"]);
    expect(
      extractOztixArtists({
        EventName: "Buffalo Traffic Jam",
        Bands: ["Buffalo Traffic Jam"],
        Performances: [],
        SpecialGuests: "Down Under Tour ‘26"
      }).artists
    ).toEqual(["Buffalo Traffic Jam"]);
  });

  it("parses clear comma-separated title lineups when Oztix has no artist arrays", () => {
    expect(
      parseOztixTitleLineupArtists("Sonic Haze, Retromode, Mustard & Draz n' the Druzy")
    ).toEqual(["Sonic Haze", "Retromode", "Mustard", "Draz n' the Druzy"]);
    expect(parseOztixTitleLineupArtists("Rave & Brunch")).toEqual([]);

    expect(
      extractOztixArtists({
        EventName: "Sonic Haze, Retromode, Mustard & Draz n' the Druzy",
        Bands: [],
        Performances: [],
        SpecialGuests: ""
      })
    ).toEqual({
      artists: ["Sonic Haze", "Retromode", "Mustard", "Draz n' the Druzy"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("parses explicit featured performers from Oztix titles", () => {
    expect(parseOztixTitleFeaturedArtists("Tribute Night ft. Lindsay Wells")).toEqual([
      "Lindsay Wells"
    ]);
    expect(parseOztixTitleFeaturedArtists("Tribute Night feat. Lindsay Wells")).toEqual([
      "Lindsay Wells"
    ]);
    expect(parseOztixTitleFeaturedArtists("Tribute Night featuring Lindsay Wells")).toEqual([
      "Lindsay Wells"
    ]);
  });

  it("parses narrow colon presents titles as the presented artist", () => {
    expect(
      parseOztixTitlePresentedArtists("The gRaveyard Presents: Ruby Rising")
    ).toEqual(["Ruby Rising"]);
    expect(
      parseOztixTitlePresentedArtists("Glam Funk Band presents Ministry of Disco")
    ).toEqual([]);

    expect(
      extractOztixArtists({
        EventName: "The gRaveyard Presents: Ruby Rising",
        Bands: [],
        Performances: [],
        SpecialGuests: ""
      })
    ).toEqual({
      artists: ["Ruby Rising"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("drops tribute subjects when an Oztix title names the real featured performer", () => {
    expect(
      extractOztixArtists({
        EventName: "Jimi Hendrix The Australian Tribute ft. Lindsay Wells",
        Bands: ["Jimi Hendrix"],
        Performances: [{ Name: "Jimi Hendrix" }],
        SpecialGuests: "with a special guest to be announced"
      })
    ).toEqual({
      artists: ["Lindsay Wells"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("splits Oztix bullet-delimited structured artist strings", () => {
    expect(
      extractOztixArtists({
        EventName: "VOICES OF HOUSE - PERTH",
        Bands: [
          "Darren Bouthier • Chappers • Mitchell James Plus the electric energy of Creo Saxman with Percussion by CoCo & The VOH Dancers"
        ],
        Performances: []
      })
    ).toEqual({
      artists: [
        "Darren Bouthier",
        "Chappers",
        "Mitchell James",
        "Creo Saxman",
        "CoCo & The VOH Dancers"
      ],
      artistExtractionKind: "structured"
    });
  });

  it("keeps tribute performers and drops slash-separated tribute subjects", () => {
    expect(
      extractOztixArtists({
        EventName: "Rammstein / Slipknot / Marilyn Manson Tribute Night",
        Bands: [
          "Marilyn Manson",
          "performed by The Beautiful People / Slipknot",
          "performed by The Maggots / Rammstein",
          "performed by Rated R"
        ],
        Performances: []
      })
    ).toEqual({
      artists: ["The Beautiful People", "The Maggots", "Rated R"],
      artistExtractionKind: "structured"
    });
  });

  it("cleans live Rosemount tribute, album, and country-suffix artist noise", () => {
    expect(
      extractOztixArtists({
        EventName: "SILVERSPOON – A Tribute to Silverchair & Grinspoon",
        Bands: ["SILVERCHAIR"],
        Performances: [{ Name: "SILVERCHAIR" }],
        SpecialGuests: "Emotion Sickness & Chemically Disheartened with Phoenix Nights"
      })
    ).toEqual({
      artists: ["Emotion Sickness", "Chemically Disheartened", "Phoenix Nights"],
      artistExtractionKind: "parsed_text"
    });

    expect(
      extractOztixArtists({
        EventName: "The Miseducation of Lauryn Hill Album played in full",
        Bands: [],
        Performances: [],
        SpecialGuests: "with Elise Lynelle. Support from Your Girl Persia."
      })
    ).toEqual({
      artists: ["Elise Lynelle", "Your Girl Persia"],
      artistExtractionKind: "parsed_text"
    });

    expect(
      extractOztixArtists({
        EventName: "ARMAGEDOOM VIII ft. Candlemass (SWE)",
        Bands: ["Candlemass"],
        Performances: [{ Name: "Candlemass" }],
        SpecialGuests: ""
      })
    ).toEqual({
      artists: ["Candlemass"],
      artistExtractionKind: "structured"
    });
  });

  it("drops tribute support-set descriptions without dropping the named performer", () => {
    expect(
      extractOztixArtists({
        EventName: "LANDSLIDE - Fleetwood Mac and Stevie Nicks Tribute Show",
        Bands: ["LandSlide", "support set of EAGLES GREATEST HITS"],
        Performances: []
      })
    ).toEqual({
      artists: ["LandSlide"],
      artistExtractionKind: "structured"
    });
  });

  it("removes broken emoji question-mark runs from Oztix titles and avoids theme-party subjects as artists", () => {
    const normalized = normalizeOztixHit({
      EventGuid: "sleep-token-party",
      EventName:
        "????SLEEP TOKEN vs BAD OMENS: WORSHIP PARTY???? + HLH/DOD AFTER PARTY - PERTH",
      DateStart: "2026-04-26T12:00:00",
      EventUrl: "https://tickets.oztix.com.au/outlet/event/sleep-token-party",
      Categories: ["Music"],
      _geoloc: { lat: -31.9523, lng: 115.8613 },
      Venue: {
        Name: "Amplifier Bar",
        Locality: "Perth"
      },
      Bands: [
        "DJs playing the best of Sleep Token",
        "Bad Omens",
        "the greatest emo",
        "metalcore",
        "alternative tracks of all time ALL. NIGHT. LONG",
        "HLH/DOD after party!"
      ]
    });

    expect(normalized.title).toBe(
      "SLEEP TOKEN vs BAD OMENS: WORSHIP PARTY + HLH/DOD AFTER PARTY - PERTH"
    );
    expect(normalized.artists).toEqual([]);
    expect(normalized.artistExtractionKind).toBe("unknown");
  });

  it("drops local guest placeholders while retaining a title-billed artist", () => {
    expect(
      extractOztixArtists({
        EventName: "TO THE GRAVE 'NAIL AUSTRALIA TO THE WALLS' with NO CURE (USA)",
        SpecialGuests: "local guests TBC",
        Bands: [],
        Performances: []
      })
    ).toEqual({
      artists: ["NO CURE"],
      artistExtractionKind: "parsed_text"
    });
  });

});
