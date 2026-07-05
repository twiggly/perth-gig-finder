export const HOMEPAGE_BRAND_RESET_EVENT = "homepage-brand-reset";

interface HomepageBrandResetEventTarget {
  dispatchEvent(event: Event): boolean;
}

export function dispatchHomepageBrandResetEvent(
  targetWindow: HomepageBrandResetEventTarget | null | undefined =
    typeof window === "undefined" ? undefined : window
): boolean {
  if (!targetWindow) {
    return false;
  }

  return targetWindow.dispatchEvent(new Event(HOMEPAGE_BRAND_RESET_EVENT));
}
