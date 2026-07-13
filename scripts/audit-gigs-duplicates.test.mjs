import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyFuzzyDuplicatePair,
  isDistinctTicketedSessionPair
} from "./audit-gigs-duplicates.mjs";

function createGig(overrides) {
  return {
    starts_at: "2026-09-26T09:30:00.000Z",
    ticket_url: "https://tickets.example.com/event/default",
    title: "Default show",
    ...overrides
  };
}

test("excludes independently ticketed early and late sessions", () => {
  const earlyShow = createGig({
    starts_at: "2026-09-26T09:30:00.000Z",
    ticket_url:
      "https://tickets.oztix.com.au/outlet/event/fa2146e6-d509-4b27-879c-fa32e04696e2",
    title: "Adam Hall & the Velvet Playboys Big Birthday Concert! (Early Show)"
  });
  const lateShow = createGig({
    starts_at: "2026-09-26T12:30:00.000Z",
    ticket_url:
      "https://tickets.oztix.com.au/outlet/event/e057ce1c-a21b-4798-9833-a744d7f154e0",
    title: "Adam Hall & the Velvet Playboys Big Birthday Concert! (Late show)"
  });

  assert.equal(isDistinctTicketedSessionPair(earlyShow, lateShow), true);
  assert.equal(classifyFuzzyDuplicatePair(earlyShow, lateShow), null);
});

test("keeps the unmerged Sexton feed rows reportable", () => {
  const weeklyRow = createGig({
    starts_at: "2026-07-15T11:00:00.000Z",
    ticket_url: null,
    title: "SEXTON"
  });
  const comingUpRow = createGig({
    starts_at: "2026-07-15T11:00:00.000Z",
    ticket_url:
      "https://tickets.oztix.com.au/outlet/event/d3c80572-1d88-44ba-a881-d29599037107",
    title: "Sexton Live At The Bird"
  });

  assert.deepEqual(classifyFuzzyDuplicatePair(weeklyRow, comingUpRow), {
    score: 0.5
  });
});

test("does not suppress fuzzy matches based on different times alone", () => {
  const first = createGig({
    starts_at: "2026-07-15T09:00:00.000Z",
    ticket_url: "https://tickets.example.com/event/one",
    title: "Sexton"
  });
  const second = createGig({
    starts_at: "2026-07-15T11:00:00.000Z",
    ticket_url: "https://tickets.example.com/event/two",
    title: "Sexton Live At The Bird"
  });

  assert.notEqual(classifyFuzzyDuplicatePair(first, second), null);
});

test("keeps matching session labels reportable", () => {
  const first = createGig({
    starts_at: "2026-09-26T09:30:00.000Z",
    ticket_url: "https://tickets.example.com/event/one",
    title: "Birthday Concert (Early Show)"
  });
  const second = createGig({
    starts_at: "2026-09-26T10:30:00.000Z",
    ticket_url: "https://tickets.example.com/event/two",
    title: "Birthday Concert (Early Show)"
  });

  assert.equal(isDistinctTicketedSessionPair(first, second), false);
  assert.notEqual(classifyFuzzyDuplicatePair(first, second), null);
});
