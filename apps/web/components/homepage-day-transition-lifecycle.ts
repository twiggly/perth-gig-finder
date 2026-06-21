export type HomepageDayTransitionLifecyclePhase =
  | "idle"
  | "preparing"
  | "animating"
  | "settling";

export interface HomepageDayTransitionLifecycleLike {
  phase: Exclude<HomepageDayTransitionLifecyclePhase, "idle">;
}

export function getHomepageDayTransitionLifecyclePhase(
  transition: HomepageDayTransitionLifecycleLike | null
): HomepageDayTransitionLifecyclePhase {
  return transition?.phase ?? "idle";
}

export function isHomepageDayTransitionActive(
  phase: HomepageDayTransitionLifecyclePhase
): boolean {
  return phase !== "idle";
}

export function isHomepageDayTransitionPreparing(
  phase: HomepageDayTransitionLifecyclePhase
): boolean {
  return phase === "preparing";
}

export function isHomepageDayTransitionAnimating(
  phase: HomepageDayTransitionLifecyclePhase
): boolean {
  return phase === "animating";
}

export function isHomepageDayTransitionSettling(
  phase: HomepageDayTransitionLifecyclePhase
): boolean {
  return phase === "settling";
}
