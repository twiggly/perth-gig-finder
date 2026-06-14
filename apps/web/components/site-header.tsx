import React from "react";

import { SiteHeaderActions } from "@/components/site-header-actions";
import { SiteHeaderBrand } from "@/components/site-header-brand";
import { SiteHeaderEyebrow } from "@/components/site-header-eyebrow";

interface SiteHeaderProps {
  actions?: boolean;
  className?: string;
}

export function SiteHeader({ actions = false, className }: SiteHeaderProps) {
  const rootClassName = ["site-header-shell", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName}>
      <header className="site-header">
        <SiteHeaderEyebrow />
        <SiteHeaderBrand />
      </header>
      {actions ? <SiteHeaderActions /> : null}
    </div>
  );
}
