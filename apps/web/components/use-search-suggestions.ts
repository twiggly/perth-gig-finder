"use client";

import { useDeferredValue, useEffect, useState } from "react";

import type { AutocompleteSuggestion } from "@/lib/search-suggestion-types";

interface SearchSuggestionRequestInput {
  query: string;
  venueSlugs?: string[];
}

interface UseSearchSuggestionsOptions {
  input: string;
  isOpen: boolean;
  selectedVenueSlugs: string[];
}

export function buildSearchSuggestionsRequestPath({
  query,
  venueSlugs = []
}: SearchSuggestionRequestInput): string | null {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return null;
  }

  const params = new URLSearchParams({
    q: trimmedQuery
  });

  venueSlugs.forEach((slug) => params.append("venue", slug));

  return `/api/search-suggestions?${params.toString()}`;
}

export function useSearchSuggestions({
  input,
  isOpen,
  selectedVenueSlugs
}: UseSearchSuggestionsOptions) {
  const deferredInput = useDeferredValue(input);
  const selectedVenueSlugKey = selectedVenueSlugs.join("|");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const requestPath = buildSearchSuggestionsRequestPath({
      query: deferredInput,
      venueSlugs: selectedVenueSlugKey ? selectedVenueSlugKey.split("|") : []
    });

    if (!requestPath) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    setIsLoading(true);

    fetch(requestPath, {
      signal: abortController.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not fetch search suggestions.");
        }

        return (await response.json()) as AutocompleteSuggestion[];
      })
      .then((nextSuggestions) => {
        setSuggestions(nextSuggestions);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(error);
        setSuggestions([]);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [deferredInput, isOpen, selectedVenueSlugKey]);

  function resetSuggestions() {
    setSuggestions([]);
    setIsLoading(false);
  }

  return {
    isLoading,
    resetSuggestions,
    suggestions
  };
}
