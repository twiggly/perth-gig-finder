import React from "react";
import { ActionIcon } from "@mantine/core";

import type { SwipeDirection } from "@/lib/homepage-dates";
import type { HomepageDayArrowVisualProps } from "./homepage-day-arrow-feedback";
import type { HomepageDayArrowButtonBindings } from "./use-homepage-day-arrow-feedback";

function SkipTrackIcon({ direction }: { direction: SwipeDirection }) {
  const isPrevious = direction === "previous";

  return (
    <svg
      aria-hidden="true"
      className={`day-browser__skip-track-icon day-browser__skip-track-icon--${direction}`}
      fill="currentColor"
      height="1em"
      viewBox="0 0 256 256"
      width="1em"
    >
      <g transform={isPrevious ? "translate(256 0) scale(-1 1)" : undefined}>
        <path d="M200,32a8,8,0,0,0-8,8v69.23L72.43,34.45A15.95,15.95,0,0,0,48,47.88V208.12a16,16,0,0,0,24.43,13.43L192,146.77V216a8,8,0,0,0,16,0V40A8,8,0,0,0,200,32Z" />
      </g>
    </svg>
  );
}

type HomepageDayArrowProps =
  | {
      bindings: HomepageDayArrowButtonBindings;
      direction: SwipeDirection;
      disabled: boolean;
      unavailable: boolean;
      variant: "button";
    }
  | {
      bindings: HomepageDayArrowVisualProps;
      direction: SwipeDirection;
      unavailable: boolean;
      variant: "cover";
    };

export function HomepageDayArrow(props: HomepageDayArrowProps) {
  const { bindings, direction } = props;

  if (props.variant === "button") {
    return (
      <ActionIcon
        {...bindings}
        aria-label={direction === "previous" ? "Previous date" : "Next date"}
        data-date-unavailable={props.unavailable ? "true" : undefined}
        disabled={props.disabled}
        type="button"
        variant="subtle"
      >
        <SkipTrackIcon direction={direction} />
      </ActionIcon>
    );
  }

  return (
    <span
      {...bindings}
      data-date-unavailable={props.unavailable ? "true" : undefined}
    >
      <SkipTrackIcon direction={direction} />
    </span>
  );
}
