import React, { useEffect } from "react";
import {
  Combobox,
  ScrollArea,
  Text,
  UnstyledButton,
  useCombobox
} from "@mantine/core";

import type { VenueOption } from "@/lib/venues";

interface VenueFilterMenuProps {
  inputRef?: React.Ref<HTMLInputElement>;
  isOpen: boolean;
  isPending: boolean;
  isPhoneScrollbarDevice: boolean;
  menuId: string;
  menuRef?: React.Ref<HTMLDivElement>;
  onClose: () => void;
  onInputChange: React.ChangeEventHandler<HTMLInputElement>;
  onSelectVenue: (venue: VenueOption) => void;
  onTriggerClick: () => void;
  suggestions: VenueOption[];
  venueInput: string;
}

function VenueMenuChevron() {
  return (
    <svg
      aria-hidden="true"
      className="venue-menu__chevron"
      fill="none"
      height="18"
      viewBox="0 0 20 20"
      width="18"
    >
      <path
        d="M5.5 7.75 10 12.25l4.5-4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export function VenueFilterMenu({
  inputRef,
  isOpen,
  isPending,
  isPhoneScrollbarDevice,
  menuId,
  menuRef,
  onClose,
  onInputChange,
  onSelectVenue,
  onTriggerClick,
  suggestions,
  venueInput
}: VenueFilterMenuProps) {
  const combobox = useCombobox({
    opened: isOpen,
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      onClose();
    }
  });
  const suggestionSlugKey = suggestions.map((venue) => venue.slug).join("|");

  useEffect(() => {
    if (!isOpen || suggestions.length === 0) {
      combobox.resetSelectedOption();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      combobox.selectFirstOption();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [combobox, isOpen, suggestionSlugKey, suggestions.length]);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    onInputChange(event);
    combobox.updateSelectedOptionIndex();
  }

  function handleOptionSubmit(slug: string) {
    const selectedVenue = suggestions.find((venue) => venue.slug === slug);

    if (selectedVenue) {
      onSelectVenue(selectedVenue);
    }
  }

  return (
    <div className="venue-menu" ref={menuRef}>
      <Combobox
        dropdownPadding={0}
        hideDetached={false}
        offset={10}
        onOptionSubmit={handleOptionSubmit}
        position="bottom-end"
        store={combobox}
        width="min(var(--venue-menu-popover-width), calc(100vw - 1rem))"
        withinPortal={false}
        zIndex={25}
      >
        <Combobox.Target
          targetType="button"
          withAriaAttributes={false}
          withKeyboardNavigation={false}
        >
          <UnstyledButton
            aria-controls={menuId}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            className={`venue-menu__trigger${
              isOpen ? " venue-menu__trigger--open" : ""
            }`}
            onClick={onTriggerClick}
            type="button"
          >
            <span>Venues</span>
            <VenueMenuChevron />
          </UnstyledButton>
        </Combobox.Target>
        {isOpen ? (
          <Combobox.Dropdown className="venue-menu__popover" id={menuId}>
            <label className="sr-only" htmlFor="venue-filter-input">
              Search venues
            </label>
            <Combobox.Search
              classNames={{ input: "filter-input filter-input--compact" }}
              id="venue-filter-input"
              onChange={handleInputChange}
              placeholder="Search venues"
              ref={inputRef}
              type="search"
              unstyled
              value={venueInput}
            />
            <ScrollArea.Autosize
              className="venue-menu__scroller"
              mah="18rem"
              offsetScrollbars={isPhoneScrollbarDevice ? false : "present"}
              overscrollBehavior="contain"
              scrollbarSize={isPhoneScrollbarDevice ? 12 : undefined}
              scrollbars="y"
              type={isPhoneScrollbarDevice ? "always" : "auto"}
            >
              <div className="venue-menu__results">
                {suggestions.length > 0 ? (
                  <Combobox.Options
                    aria-label="Venue options"
                    className="venue-suggestions"
                  >
                    {suggestions.map((venue) => (
                      <Combobox.Option
                        className="venue-suggestion"
                        key={venue.slug}
                        value={venue.slug}
                      >
                        <span>{venue.name}</span>
                        {venue.suburb ? <span>{venue.suburb}</span> : null}
                      </Combobox.Option>
                    ))}
                  </Combobox.Options>
                ) : isPending ? (
                  <Text className="venue-picker__status" component="p">
                    Loading venues…
                  </Text>
                ) : (
                  <Text className="venue-picker__status" component="p">
                    No matching venues yet.
                  </Text>
                )}
              </div>
            </ScrollArea.Autosize>
          </Combobox.Dropdown>
        ) : null}
      </Combobox>
    </div>
  );
}
