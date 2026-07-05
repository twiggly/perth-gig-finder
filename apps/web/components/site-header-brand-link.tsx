"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

import { suppressNextHomepageActiveDateUrlSync } from "@/lib/homepage-dates";
import { dispatchHomepageBrandResetEvent } from "./homepage-brand-reset-event";

interface SiteHeaderBrandLinkProps {
  children: React.ReactNode;
}

interface HomepageBrandClickEvent {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function shouldResetHomepageBrandNavigation(
  pathname: string | null,
  event: HomepageBrandClickEvent
): boolean {
  return (
    pathname === "/" &&
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function SiteHeaderBrandLink({ children }: SiteHeaderBrandLinkProps) {
  const pathname = usePathname();
  const router = useRouter();

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!shouldResetHomepageBrandNavigation(pathname, event)) {
      return;
    }

    event.preventDefault();
    suppressNextHomepageActiveDateUrlSync();
    dispatchHomepageBrandResetEvent();
    router.replace("/");
  }

  return (
    <Link
      className="site-header__brand-link"
      href="/"
      onClick={handleClick}
      prefetch
    >
      {children}
    </Link>
  );
}
