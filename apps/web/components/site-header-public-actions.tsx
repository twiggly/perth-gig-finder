"use client";

import React from "react";

import { HeaderLocationSelect } from "./header-location-select";
import { SiteHeaderActions } from "./site-header-actions";
import { SiteHeaderMenu, type HeaderMenuState } from "./site-header-menu";

interface SiteHeaderPublicActionsProps {
  children?: React.ReactNode;
  initialHeaderMenuState?: HeaderMenuState;
}

export function SiteHeaderPublicActions({
  children,
  initialHeaderMenuState
}: SiteHeaderPublicActionsProps) {
  return (
    <SiteHeaderActions showProfile={false}>
      <HeaderLocationSelect />
      {children}
      <SiteHeaderMenu initialHeaderMenuState={initialHeaderMenuState} />
    </SiteHeaderActions>
  );
}
