export const GIG_DETAIL_RETURN_STATE_STORAGE_KEY =
  "gig-radar:gig-detail-return:v1";
export const GIG_DETAIL_RETURN_STATE_MAX_AGE_MS = 30 * 60 * 1000;

const RETURN_URL_BASE = "https://gigradar.local";
const PERTH_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Australia/Perth",
  year: "numeric"
});

export interface GigDetailReturnState {
  createdAt: number;
  href: string;
  slug: string;
}

export interface GigDetailReturnStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

export interface GigDetailReturnClickInput {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target?: string | null;
}

export interface HomepageReturnLocation {
  hash: string;
  pathname: string;
  search: string;
}

export function isPlainGigDetailNavigationClick(
  input: GigDetailReturnClickInput
): boolean {
  return (
    !input.defaultPrevented &&
    input.button === 0 &&
    !input.metaKey &&
    !input.ctrlKey &&
    !input.shiftKey &&
    !input.altKey &&
    (!input.target || input.target === "_self")
  );
}

export function buildHomepageReturnHref(
  location: HomepageReturnLocation,
  startsAt: string
): string | null {
  if (location.pathname !== "/") {
    return null;
  }

  const fallbackHref = buildGigDetailFallbackHref(startsAt);
  const fallbackDate = new URL(fallbackHref, RETURN_URL_BASE).searchParams.get(
    "date"
  );
  const params = new URLSearchParams(
    location.search.startsWith("?") ? location.search.slice(1) : location.search
  );

  params.delete("when");

  if (fallbackDate) {
    params.set("date", fallbackDate);
  }

  const nextSearch = params.toString();

  return `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`;
}

export function buildGigDetailFallbackHref(startsAt: string): string {
  const parts = PERTH_DATE_FORMATTER.formatToParts(new Date(startsAt)).reduce<
    Record<string, string>
  >((values, part) => {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }

    return values;
  }, {});

  return `/?date=${parts.year}-${parts.month}-${parts.day}`;
}

export function writeGigDetailReturnState({
  href,
  nowMs = Date.now(),
  slug,
  storage
}: {
  href: string;
  nowMs?: number;
  slug: string;
  storage: GigDetailReturnStorage;
}): void {
  storage.setItem(
    GIG_DETAIL_RETURN_STATE_STORAGE_KEY,
    JSON.stringify({ createdAt: nowMs, href, slug })
  );
}

export function readValidGigDetailReturnState({
  nowMs = Date.now(),
  slug,
  storage
}: {
  nowMs?: number;
  slug: string;
  storage: GigDetailReturnStorage;
}): GigDetailReturnState | null {
  const rawValue = storage.getItem(GIG_DETAIL_RETURN_STATE_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const state = JSON.parse(rawValue) as Partial<GigDetailReturnState>;

    if (
      state.slug !== slug ||
      typeof state.href !== "string" ||
      !isValidHomepageReturnHref(state.href) ||
      typeof state.createdAt !== "number" ||
      !Number.isFinite(state.createdAt)
    ) {
      return null;
    }

    const ageMs = nowMs - state.createdAt;

    if (ageMs < 0 || ageMs > GIG_DETAIL_RETURN_STATE_MAX_AGE_MS) {
      return null;
    }

    return {
      createdAt: state.createdAt,
      href: state.href,
      slug: state.slug
    };
  } catch {
    return null;
  }
}

export function consumeValidGigDetailReturnState({
  nowMs = Date.now(),
  slug,
  storage
}: {
  nowMs?: number;
  slug: string;
  storage: GigDetailReturnStorage;
}): GigDetailReturnState | null {
  const state = readValidGigDetailReturnState({ nowMs, slug, storage });

  if (state) {
    storage.removeItem(GIG_DETAIL_RETURN_STATE_STORAGE_KEY);
  }

  return state;
}

export function recordCurrentGigDetailReturnState(
  slug: string,
  startsAt: string,
  clickInput: GigDetailReturnClickInput
): void {
  if (
    typeof window === "undefined" ||
    !isPlainGigDetailNavigationClick(clickInput)
  ) {
    return;
  }

  const href = buildHomepageReturnHref(window.location, startsAt);

  if (!href) {
    return;
  }

  try {
    window.history.replaceState(window.history.state, "", href);
  } catch {
    // History can be unavailable in unusual embedded browser contexts.
  }

  try {
    writeGigDetailReturnState({
      href,
      slug,
      storage: window.sessionStorage
    });
  } catch {
    // Storage can be unavailable in private browsing or locked-down contexts.
  }
}

export function consumeCurrentGigDetailReturnState(
  slug: string
): GigDetailReturnState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return consumeValidGigDetailReturnState({
      slug,
      storage: window.sessionStorage
    });
  } catch {
    return null;
  }
}

function isValidHomepageReturnHref(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) {
    return false;
  }

  try {
    const url = new URL(href, RETURN_URL_BASE);

    return url.origin === RETURN_URL_BASE && url.pathname === "/";
  } catch {
    return false;
  }
}
