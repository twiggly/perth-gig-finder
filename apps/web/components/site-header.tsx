import React from "react";

import { SiteHeaderBrand } from "@/components/site-header-brand";
import { SiteHeaderEyebrow } from "@/components/site-header-eyebrow";
import { SiteHeaderPublicActions } from "@/components/site-header-public-actions";

interface SiteHeaderProps {
  actions?: "public-menu";
  className?: string;
}

export function SiteHeader({ actions, className }: SiteHeaderProps) {
  const rootClassName = ["site-header-shell", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName}>
      <header className="site-header">
        <SiteHeaderEyebrow />
        <SiteHeaderBrand />
      </header>
      {actions === "public-menu" ? <SiteHeaderPublicActions /> : null}
    </div>
  );
}
