"use client";

import { useDeferredValue, useEffect, useState } from "react";

import type { VenueOption } from "@/lib/venues";

interface VenueSuggestionRequestInput {
  excludedSlugs?: string[];
  query?: string;
}

interface VenueSuggestionsPendingInput {
  deferredInput: string;
  input: string;
  isLoadingSuggestions: boolean;
  isOpen: boolean;
  isPreloadingSuggestions: boolean;
}

interface UseVenueSuggestionsOptions {
  input: string;
  isOpen: boolean;
  selectedVenueSlugs: string[];
}

export function buildVenueSuggestionsRequestPath({
  excludedSlugs = [],
  query
}: VenueSuggestionRequestInput = {}): string {
  const params = new URLSearchParams();
  const trimmedQuery = query?.trim() ?? "";

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  excludedSlugs.forEach((slug) => params.append("exclude", slug));

  return `/api/venues?${params.toString()}`;
}

export function getVenueSuggestionsPendingState({
  deferredInput,
  input,
  isLoadingSuggestions,
  isOpen,
  isPreloadingSuggestions
}: VenueSuggestionsPendingInput): boolean {
  return (
    isLoadingSuggestions ||
    (isOpen && !deferredInput.trim() && isPreloadingSuggestions) ||
    (isOpen && input.trim() !== deferredInput.trim())
  );
}

export function useVenueSuggestions({
  input,
  isOpen,
  selectedVenueSlugs
}: UseVenueSuggestionsOptions) {
  const deferredInput = useDeferredValue(input);
  const selectedVenueSlugKey = selectedVenueSlugs.join("|");
  const [preloadedSuggestions, setPreloadedSuggestions] = useState<VenueOption[]>(
    []
  );
  const [isPreloadingSuggestions, setIsPreloadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<VenueOption[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const excludedSlugs = selectedVenueSlugKey ? selectedVenueSlugKey.split("|") : [];

  useEffect(() => {
    const abortController = new AbortController();

    setIsPreloadingSuggestions(true);

    fetch(buildVenueSuggestionsRequestPath({ excludedSlugs }), {
      signal: abortController.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not preload venue suggestions.");
        }

        return (await response.json()) as VenueOption[];
      })
      .then((venues) => {
        setPreloadedSuggestions(venues);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(error);
        setPreloadedSuggestions([]);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsPreloadingSuggestions(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [selectedVenueSlugKey]);

  useEffect(() => {
    if (input.trim()) {
      return;
    }

    setSuggestions(preloadedSuggestions);
    setHighlightedIndex(-1);
  }, [preloadedSuggestions, input]);

  useEffect(() => {
    if (!isOpen) {
      setIsLoadingSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }

    const trimmedInput = deferredInput.trim();

    if (!trimmedInput) {
      setSuggestions(preloadedSuggestions);
      setIsLoadingSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }

    const abortController = new AbortController();

    setIsLoadingSuggestions(true);
    setHighlightedIndex(-1);

    fetch(
      buildVenueSuggestionsRequestPath({
        excludedSlugs,
        query: trimmedInput
      }),
      {
        signal: abortController.signal
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not fetch venue suggestions.");
        }

        return (await response.json()) as VenueOption[];
      })
      .then((venues) => {
        setSuggestions(venues);
        setHighlightedIndex(venues.length > 0 ? 0 : -1);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(error);
        setSuggestions([]);
        setHighlightedIndex(-1);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingSuggestions(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [deferredInput, isOpen, preloadedSuggestions, selectedVenueSlugKey]);

  function resetSuggestions() {
    setSuggestions(preloadedSuggestions);
    setHighlightedIndex(-1);
  }

  return {
    highlightedIndex,
    isPending: getVenueSuggestionsPendingState({
      deferredInput,
      input,
      isLoadingSuggestions,
      isOpen,
      isPreloadingSuggestions
    }),
    resetSuggestions,
    setHighlightedIndex,
    suggestions
  };
}
