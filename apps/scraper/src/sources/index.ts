import { humanitixPerthMusicSource } from "./humanitix-perth-music";
import { milkBarSource } from "./milk-bar";
import { moshtixWaSource } from "./moshtix-wa";
import { oztixWaSource } from "./oztix-wa";
import { rosemountHotelSource } from "./rosemount-hotel";
import { theBirdSource } from "./the-bird";
import { ticketekWaSource } from "./ticketek-wa";
import { ticketmasterAuSource } from "./ticketmaster-au";

export const sources = [
  humanitixPerthMusicSource,
  milkBarSource,
  rosemountHotelSource,
  theBirdSource,
  oztixWaSource,
  moshtixWaSource,
  ticketekWaSource,
  ticketmasterAuSource
] as const;
