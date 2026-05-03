import React, { useEffect } from "react";
import {
  Combobox,
  Text,
  TextInput,
  UnstyledButton,
  useCombobox
} from "@mantine/core";

import type { SearchSuggestion } from "@/lib/search-suggestion-types";

interface SearchFilterFormProps {
  formRef?: React.Ref<HTMLFormElement>;
  isLoading: boolean;
  isOpen: boolean;
  menuId: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onClear: () => void;
  onClose: () => void;
  onFocus: React.FocusEventHandler<HTMLInputElement>;
  onSelectSuggestion: (suggestion: SearchSuggestion) => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  searchInput: string;
  suggestions: SearchSuggestion[];
}

function SearchSuggestionIcon({
  icon
}: {
  icon: SearchSuggestion["icon"];
}) {
  if (icon === "search") {
    return (
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
        <circle
          cx="8.75"
          cy="8.75"
          r="5.25"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="m12.5 12.5 4 4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (icon === "gig") {
    return (
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
        <rect
          height="11"
          rx="2.25"
          stroke="currentColor"
          strokeWidth="1.5"
          width="13"
          x="3.5"
          y="5.5"
        />
        <path
          d="M6.5 3.5v4M13.5 3.5v4M3.5 9.5h13"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (icon === "artist") {
    return (
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
        <rect
          height="8"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.6"
          width="6"
          x="7"
          y="3"
        />
        <path
          d="M5.5 8.5a4.5 4.5 0 0 0 9 0M10 13v3.5M7.5 16.5h5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
      <path
        d="M10 16.5s4.5-4.915 4.5-8a4.5 4.5 0 0 0-9 0c0 3.085 4.5 8 4.5 8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="8.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function getSearchSuggestionKey(suggestion: SearchSuggestion): string {
  return suggestion.type === "venue"
    ? `${suggestion.type}-${suggestion.slug}`
    : `${suggestion.type}-${suggestion.label}`;
}

export function SearchFilterForm({
  formRef,
  isLoading,
  isOpen,
  menuId,
  onChange,
  onClear,
  onClose,
  onFocus,
  onSelectSuggestion,
  onSubmit,
  searchInput,
  suggestions
}: SearchFilterFormProps) {
  const combobox = useCombobox({
    opened: isOpen,
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      onClose();
    }
  });
  const trimmedSearchInput = searchInput.trim();
  const shouldShowSuggestions = isOpen && Boolean(trimmedSearchInput);
  const suggestionKey = suggestions.map(getSearchSuggestionKey).join("|");

  useEffect(() => {
    if (!shouldShowSuggestions || suggestions.length === 0) {
      combobox.resetSelectedOption();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      combobox.selectFirstOption();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [combobox, shouldShowSuggestions, suggestionKey, suggestions.length]);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event);
    combobox.updateSelectedOptionIndex();
  }

  function handleOptionSubmit(value: string) {
    const selectedSuggestion = suggestions.find(
      (suggestion) => getSearchSuggestionKey(suggestion) === value
    );

    if (selectedSuggestion) {
      onSelectSuggestion(selectedSuggestion);
    }
  }

  return (
    <form className="filter-toolbar__search" onSubmit={onSubmit} ref={formRef}>
      <Combobox
        dropdownPadding={0}
        offset={10}
        onOptionSubmit={handleOptionSubmit}
        position="bottom-start"
        store={combobox}
        withinPortal={false}
        zIndex={25}
      >
        <label className="sr-only" htmlFor="gig-search-input">
          Search gigs, artists, venues, and suburbs
        </label>
        <Combobox.Target withAriaAttributes={false}>
          <TextInput
            id="gig-search-input"
            aria-controls={menuId}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            classNames={{
              input: `filter-input filter-input--compact${
                searchInput ? " filter-input--has-mobile-clear" : ""
              }`
            }}
            onChange={handleInputChange}
            onFocus={onFocus}
            placeholder="Search events & artists"
            type="search"
            unstyled
            value={searchInput}
          />
        </Combobox.Target>
        {searchInput ? (
          <UnstyledButton
            aria-label="Clear search"
            className="filter-toolbar__search-clear"
            onClick={onClear}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </UnstyledButton>
        ) : null}
        {shouldShowSuggestions ? (
          <Combobox.Dropdown className="search-menu__popover">
            <div className="search-menu__results">
              <Combobox.Options
                aria-label="Search suggestions"
                className="search-suggestions"
                id={menuId}
              >
                {suggestions.map((suggestion) => (
                  <Combobox.Option
                    className={`search-suggestion${
                      suggestion.type === "search"
                        ? " search-suggestion--primary"
                        : ""
                    }`}
                    key={getSearchSuggestionKey(suggestion)}
                    value={getSearchSuggestionKey(suggestion)}
                  >
                    <span className="search-suggestion__button">
                      <span className="search-suggestion__icon">
                        <SearchSuggestionIcon icon={suggestion.icon} />
                      </span>
                      <span className="search-suggestion__content">
                        <span className="search-suggestion__label">
                          {suggestion.label}
                        </span>
                        {suggestion.subtext ? (
                          <span className="search-suggestion__subtext">
                            {suggestion.subtext}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Combobox.Option>
                ))}
              </Combobox.Options>
              {isLoading ? (
                <Text className="search-menu__status" component="p">
                  Loading suggestions…
                </Text>
              ) : null}
            </div>
          </Combobox.Dropdown>
        ) : null}
      </Combobox>
    </form>
  );
}
