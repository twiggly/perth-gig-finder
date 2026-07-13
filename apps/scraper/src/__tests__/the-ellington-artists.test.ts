import { describe, expect, it } from "vitest";

import { extractEllingtonArtists } from "../sources/the-ellington-artists";
import { theEllingtonSource } from "../sources/the-ellington";

describe("The Ellington artist extraction", () => {
  it("extracts complete parenthetical and dash-qualified performer credits", () => {
    expect(
      extractEllingtonArtists({
        title: "Music from EarthBound Live",
        contentHtml: `
          <p>
            Join jazz musicians
            <strong>
              Flavio Colonetti (piano), Aaron Caldwell (alto saxophone),
              Tom Berkmann (bass), and Daniel Susnjar (drums)
            </strong>
          </p>
        `
      })
    ).toEqual({
      artists: [
        "Flavio Colonetti",
        "Aaron Caldwell",
        "Tom Berkmann",
        "Daniel Susnjar"
      ],
      artistExtractionKind: "explicit_lineup"
    });

    expect(
      extractEllingtonArtists({
        title: "ORCH5",
        contentHtml: `
          <p>
            <strong>Simon Jeans</strong> – Guitar<br>
            <strong>Austin Salisbury</strong> – Piano<br>
            Sean Little – Bass<br>
            Alex Reid – Drums
          </p>
        `
      }).artists
    ).toEqual([
      "ORCH5",
      "Simon Jeans",
      "Austin Salisbury",
      "Sean Little",
      "Alex Reid"
    ]);
  });

  it("supports role-first credits without treating hyphenated show titles as artists", () => {
    expect(
      extractEllingtonArtists({
        title: "WorldMania",
        contentHtml: `
          <p>
            Piano – McKale Barrett<br>
            Trumpet and Modular Synth- Jonah Golds
          </p>
        `
      }).artists
    ).toEqual(["WorldMania", "McKale Barrett", "Jonah Golds"]);

    expect(
      extractEllingtonArtists({
        title: "Sax-Powered Dance Riot",
        contentHtml: `
          <p>Get ready for <strong>Sax-Powered Dance Riot!</strong></p>
          <p>
            The award-winning <strong>Perth Sax Rockers</strong> unleash their
            electrifying live show.
          </p>
        `
      }).artists
    ).toEqual(["Perth Sax Rockers"]);
  });

  it("extracts explicit performance prose while rejecting repertoire and review names", () => {
    expect(
      extractEllingtonArtists({
        title: "The Elton John Songbook",
        contentHtml: `
          <p><strong>Elton John</strong> is a musical legend.</p>
          <p>
            This night of music will be performed by
            <strong>Trevor Stockton</strong> and his band.
          </p>
        `
      }).artists
    ).toEqual(["Trevor Stockton"]);

    expect(
      extractEllingtonArtists({
        title: "Mismatched!",
        contentHtml: `
          <p>
            Join award-winning cabaret artists
            <strong>Penny Shaw and Robert Hofmann</strong> for the show.
          </p>
          <p>With the brilliant <strong>Joshua Haines</strong> at the piano.</p>
          <p>“A fine show” <strong>Sandra Bowdler, Seesaw Magazine</strong></p>
        `
      }).artists
    ).toEqual(["Penny Shaw", "Robert Hofmann", "Joshua Haines"]);

    expect(
      extractEllingtonArtists({
        title: "The King Cole Trio Story - Presented by Matt Cahill Combo",
        contentHtml: `
          <p>
            The <strong>Matt Cahill Combo</strong> recreates the music of the
            Nat King Cole Trio.
          </p>
          <p><strong>Matt Cahill</strong> – guitar</p>
        `
      }).artists
    ).toEqual(["Matt Cahill Combo", "Matt Cahill"]);
  });

  it("keeps live guests but excludes a memorial subject", () => {
    expect(
      extractEllingtonArtists({
        title: "Album Launch - Gina Williams & Guy Ghouse - Live at The Ellington",
        contentHtml: `
          <p>
            Following the passing of Gina's husband and musical partner
            <strong>Guy Ghouse</strong>, <strong>Gina Williams</strong> launches
            their album.
          </p>
          <p>
            The record features the extraordinary backing of
            <strong>Russell Holmes</strong> (piano),
            <strong>Dr Nick Abbey</strong> (bass) and
            <strong>Dr Daniel Susnjar</strong> (drums).
          </p>
          <p>
            They will be joined on stage by special guests including
            <strong>Daniel Drieberg, Lucky Oceans, Luci Poy</strong> and
            <strong>Rupert John.</strong>
          </p>
        `
      }).artists
    ).toEqual([
      "Gina Williams-Ghouse",
      "Russell Holmes",
      "Nick Abbey",
      "Daniel Susnjar",
      "Daniel Drieberg",
      "Lucky Oceans",
      "Luci Poy",
      "Rupert John"
    ]);
  });

  it("extracts narrowly worded founder credits and preserves display spelling", () => {
    expect(
      extractEllingtonArtists({
        title: "The Music of Santana",
        contentHtml: `
          <p>
            <strong>The Australian Santana Experience</strong> was formed in
            September 2006 by Sam Musca and Ezio Caffarelli and since then has
            gained a reputation as an exciting live act.
          </p>
        `
      }).artists
    ).toEqual([
      "The Australian Santana Experience",
      "Sam Musca",
      "Ezio Caffarelli"
    ]);

    expect(
      extractEllingtonArtists({
        title: "JAMES MORRISON QUARTET",
        contentHtml: `
          <p><strong>JAMES MORRISON QUARTET</strong> returns for two nights.</p>
        `
      }).artists
    ).toEqual(["James Morrison Quartet", "James Morrison"]);
  });

  it("does not infer artists from generic school ensembles", () => {
    expect(
      extractEllingtonArtists({
        title: "John XXIII College - Jazz Night at the Ellington",
        contentHtml: `
          <p>
            Student jazz bands and school ensembles will perform throughout
            the evening.
          </p>
        `
      })
    ).toEqual({ artists: [], artistExtractionKind: "unknown" });
  });

  it("repairs artists from the stored Ellington raw payload", () => {
    expect(
      theEllingtonSource.repairArtists?.({
        title: "This is Jazz! - Ellington, Coltrane, Miles and More…",
        contentHtml: `
          <p>
            <strong>
              This show features Jamie Oehlers, Harry Mitchell, Zac Grafton
              and Ben Vanderwal.
            </strong>
          </p>
        `
      })
    ).toEqual({
      artists: [
        "Jamie Oehlers",
        "Harry Mitchell",
        "Zac Grafton",
        "Ben Vanderwal"
      ],
      artistExtractionKind: "explicit_lineup"
    });
  });
});
