"use client";

import React, { useEffect, useId, useRef, useState } from "react";

import { HEADER_LOCATION_UNAVAILABLE_MARKER } from "./header-location-select";

export type HeaderMenuState = "closed" | "open" | "closing";

const HEADER_MENU_FADE_DURATION_MS = 160;
const HEADER_MENU_SECTIONS = [
  {
    heading: "Account",
    items: ["Log in", "Sign up"]
  },
  {
    heading: "Resources",
    items: ["About", "Contact"]
  }
] as const;

export function getHeaderMenuButtonStates(headerMenuState: HeaderMenuState) {
  return {
    ariaOpen: headerMenuState === "open",
    iconState: headerMenuState === "open" ? "open" : "closed",
    isOverlayMounted: headerMenuState !== "closed",
    surfaceState: headerMenuState === "closed" ? "closed" : "open"
  } as const;
}

interface HeaderMenuButtonProps {
  buttonRef: React.Ref<HTMLButtonElement>;
  controls: string;
  presentation: ReturnType<typeof getHeaderMenuButtonStates>;
  onClick: () => void;
}

function HeaderMenuButton({
  buttonRef,
  controls,
  presentation,
  onClick
}: HeaderMenuButtonProps) {
  const label = presentation.ariaOpen
    ? "Close account menu"
    : "Open account menu";

  return (
    <button
      aria-controls={controls}
      aria-expanded={presentation.ariaOpen}
      aria-label={label}
      className="site-header__menu-button"
      data-surface-state={presentation.surfaceState}
      data-state={presentation.iconState}
      onClick={onClick}
      ref={buttonRef}
      title={label}
      type="button"
    >
      <span className="site-header__menu-icon-stack" aria-hidden="true">
        <svg
          className="site-header__menu-icon site-header__menu-icon--lines"
          fill="none"
          height="22"
          viewBox="0 0 24 24"
          width="22"
        >
          <path
            d="M6 9h12M6 15h12"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
        <svg
          className="site-header__menu-icon site-header__menu-icon--close"
          fill="none"
          height="22"
          viewBox="0 0 24 24"
          width="22"
        >
          <path
            d="M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </span>
    </button>
  );
}

function HeaderMenuOverlayItems() {
  return (
    <>
      {HEADER_MENU_SECTIONS.map((section) => (
        <section className="site-header__menu-section" key={section.heading}>
          <h2 className="site-header__menu-heading">{section.heading}</h2>
          {section.items.map((item) => (
            <p className="site-header__menu-item" key={item}>
              {item}
              <span
                aria-hidden="true"
                className="site-header__menu-item-marker"
              >
                {HEADER_LOCATION_UNAVAILABLE_MARKER}
              </span>
            </p>
          ))}
        </section>
      ))}
    </>
  );
}

interface SiteHeaderMenuProps {
  initialHeaderMenuState?: HeaderMenuState;
}

export function SiteHeaderMenu({
  initialHeaderMenuState = "closed"
}: SiteHeaderMenuProps) {
  const headerMenuId = useId();
  const headerMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const headerMenuOverlayRef = useRef<HTMLDivElement | null>(null);
  const [headerMenuState, setHeaderMenuState] =
    useState<HeaderMenuState>(initialHeaderMenuState);
  const headerMenuPresentation = getHeaderMenuButtonStates(headerMenuState);

  function closeHeaderMenu() {
    setHeaderMenuState((current) => {
      if (current === "closed") {
        return current;
      }

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      return prefersReducedMotion ? "closed" : "closing";
    });
  }

  function toggleHeaderMenu() {
    if (headerMenuState === "open") {
      closeHeaderMenu();
      return;
    }

    setHeaderMenuState("open");
  }

  useEffect(() => {
    if (headerMenuState !== "closing") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHeaderMenuState("closed");
    }, HEADER_MENU_FADE_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [headerMenuState]);

  useEffect(() => {
    if (!headerMenuPresentation.isOverlayMounted) {
      return;
    }

    function closeFromEffect() {
      setHeaderMenuState((current) => {
        if (current === "closed") {
          return current;
        }

        const prefersReducedMotion =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        return prefersReducedMotion ? "closed" : "closing";
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        headerMenuButtonRef.current?.contains(target) ||
        headerMenuOverlayRef.current?.contains(target)
      ) {
        return;
      }

      closeFromEffect();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeFromEffect();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [headerMenuPresentation.isOverlayMounted]);

  return (
    <>
      <HeaderMenuButton
        buttonRef={headerMenuButtonRef}
        controls={headerMenuId}
        onClick={toggleHeaderMenu}
        presentation={headerMenuPresentation}
      />
      <div
        aria-hidden={!headerMenuPresentation.ariaOpen}
        className="site-header__menu-overlay"
        data-state={headerMenuState}
        hidden={!headerMenuPresentation.isOverlayMounted}
        id={headerMenuId}
        onClick={closeHeaderMenu}
      >
        <div
          className="site-header__menu-overlay-content"
          onClick={(event) => event.stopPropagation()}
          ref={headerMenuOverlayRef}
        >
          <HeaderMenuOverlayItems />
        </div>
      </div>
    </>
  );
}
