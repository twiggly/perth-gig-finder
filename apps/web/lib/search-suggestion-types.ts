export type SearchSuggestionIcon = "search" | "gig" | "artist" | "venue";

export type SearchSuggestion =
  | {
      type: "search";
      label: string;
      query: string;
      subtext: null;
      icon: "search";
    }
  | {
      type: "gig";
      label: string;
      query: string;
      subtext: string | null;
      icon: "gig";
    }
  | {
      type: "artist";
      label: string;
      query: string;
      subtext: string | null;
      icon: "artist";
    }
  | {
      type: "venue";
      label: string;
      slug: string;
      subtext: string | null;
      icon: "venue";
    };

export type AutocompleteSuggestion = Exclude<SearchSuggestion, { type: "search" }>;
