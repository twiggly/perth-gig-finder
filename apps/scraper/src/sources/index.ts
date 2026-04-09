import { milkBarSource } from "./milk-bar";
import { moshtixWaSource } from "./moshtix-wa";
import { oztixWaSource } from "./oztix-wa";

export const sources = [milkBarSource, oztixWaSource, moshtixWaSource] as const;
