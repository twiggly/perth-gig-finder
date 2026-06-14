"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  consumeCurrentGigDetailReturnState,
  isPlainGigDetailNavigationClick
} from "@/lib/gig-detail-return";

interface GigDetailBackLinkProps {
  fallbackHref: string;
  slug: string;
}

export function GigDetailBackLink({
  fallbackHref,
  slug
}: GigDetailBackLinkProps) {
  const router = useRouter();

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      !isPlainGigDetailNavigationClick({
        altKey: event.altKey,
        button: event.button,
        ctrlKey: event.ctrlKey,
        defaultPrevented: event.defaultPrevented,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        target: event.currentTarget.target
      })
    ) {
      return;
    }

    const returnState = consumeCurrentGigDetailReturnState(slug);

    if (!returnState) {
      return;
    }

    event.preventDefault();
    router.replace(returnState.href);
  }

  return (
    <Link
      aria-label="Back to gigs"
      className="gig-detail__back"
      href={fallbackHref}
      onClick={handleClick}
    >
      <span aria-hidden="true">←</span>
    </Link>
  );
}
