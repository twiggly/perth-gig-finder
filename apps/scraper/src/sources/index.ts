import { milkBarSource } from "./milk-bar";
import { moshtixWaSource } from "./moshtix-wa";
import { oztixWaSource } from "./oztix-wa";
import { ticketekWaSource } from "./ticketek-wa";
import { ticketmasterAuSource } from "./ticketmaster-au";

export const sources = [
  milkBarSource,
  oztixWaSource,
  moshtixWaSource,
  ticketekWaSource,
  ticketmasterAuSource
] as const;
