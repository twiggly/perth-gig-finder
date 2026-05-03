import type { MantineColorScheme, MantineColorSchemeManager } from "@mantine/core";

export type ExplicitColorScheme = "dark" | "light";

export const APP_COLOR_SCHEME_STORAGE_KEY = "mantine-color-scheme-value";
export const DEFAULT_APP_COLOR_SCHEME: ExplicitColorScheme = "dark";

export function normalizeAppColorScheme(value: unknown): ExplicitColorScheme {
  return value === "light" || value === "dark" ? value : DEFAULT_APP_COLOR_SCHEME;
}

export function getAppColorSchemeScript(): string {
  const storageKey = JSON.stringify(APP_COLOR_SCHEME_STORAGE_KEY);
  const defaultColorScheme = JSON.stringify(DEFAULT_APP_COLOR_SCHEME);

  return `try {
  var storedColorScheme = window.localStorage.getItem(${storageKey});
  var colorScheme = storedColorScheme === "light" || storedColorScheme === "dark" ? storedColorScheme : ${defaultColorScheme};
  document.documentElement.setAttribute("data-mantine-color-scheme", colorScheme);
} catch (_) {
  document.documentElement.setAttribute("data-mantine-color-scheme", ${defaultColorScheme});
}`;
}

export function createAppColorSchemeManager(): MantineColorSchemeManager {
  let handleStorageEvent: ((event: StorageEvent) => void) | undefined;

  return {
    get: () => {
      if (typeof window === "undefined") {
        return DEFAULT_APP_COLOR_SCHEME;
      }

      try {
        return normalizeAppColorScheme(
          window.localStorage.getItem(APP_COLOR_SCHEME_STORAGE_KEY)
        );
      } catch {
        return DEFAULT_APP_COLOR_SCHEME;
      }
    },
    set: (value: MantineColorScheme) => {
      if (typeof window === "undefined") {
        return;
      }

      try {
        window.localStorage.setItem(
          APP_COLOR_SCHEME_STORAGE_KEY,
          normalizeAppColorScheme(value)
        );
      } catch (error) {
        console.warn(
          "[perth-gig-finder] Unable to save color scheme preference.",
          error
        );
      }
    },
    subscribe: (onUpdate) => {
      if (typeof window === "undefined") {
        return;
      }

      handleStorageEvent = (event) => {
        if (
          event.storageArea === window.localStorage &&
          event.key === APP_COLOR_SCHEME_STORAGE_KEY
        ) {
          onUpdate(normalizeAppColorScheme(event.newValue));
        }
      };

      window.addEventListener("storage", handleStorageEvent);
    },
    unsubscribe: () => {
      if (typeof window !== "undefined" && handleStorageEvent) {
        window.removeEventListener("storage", handleStorageEvent);
      }
    },
    clear: () => {
      if (typeof window === "undefined") {
        return;
      }

      try {
        window.localStorage.removeItem(APP_COLOR_SCHEME_STORAGE_KEY);
      } catch {
        // Ignore unavailable storage; the app falls back to dark mode.
      }
    }
  };
}
