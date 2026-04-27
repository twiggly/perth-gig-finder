"use client";

import {
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme
} from "@mantine/core";

export function SiteHeaderActions() {
  const { setColorScheme } = useMantineColorScheme({ keepTransitions: true });
  const computedColorScheme = useComputedColorScheme("dark");
  const nextColorScheme = computedColorScheme === "dark" ? "light" : "dark";

  return (
    <div className="site-header__actions">
      <UnstyledButton
        aria-label={`Switch to ${nextColorScheme} mode`}
        aria-pressed={computedColorScheme === "light"}
        className="site-header__theme-toggle"
        onClick={() => setColorScheme(nextColorScheme)}
        title={`Switch to ${nextColorScheme} mode`}
        type="button"
      >
        {computedColorScheme === "dark" ? (
          <svg
            aria-hidden="true"
            className="site-header__theme-icon"
            fill="none"
            height="21"
            viewBox="0 0 24 24"
            width="21"
          >
            <path
              d="M12 4V2.75M12 21.25V20M4 12H2.75M21.25 12H20M6.35 6.35l-.88-.88M18.53 18.53l-.88-.88M17.65 6.35l.88-.88M5.47 18.53l.88-.88"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="site-header__theme-icon"
            fill="none"
            height="21"
            viewBox="0 0 24 24"
            width="21"
          >
            <path
              d="M19.25 15.36A7.7 7.7 0 0 1 8.64 4.75a7.7 7.7 0 1 0 10.61 10.61Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        )}
      </UnstyledButton>
      <div aria-hidden="true" className="site-header__profile">
        <svg
          className="site-header__profile-icon"
          fill="none"
          height="22"
          viewBox="0 0 24 24"
          width="22"
        >
          <path
            d="M16.25 8a4.25 4.25 0 1 1-8.5 0 4.25 4.25 0 0 1 8.5 0Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            d="M5.75 18.25a6.25 6.25 0 0 1 12.5 0"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      </div>
    </div>
  );
}
