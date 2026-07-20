import React from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { SiteHeader } from "@/components/site-header";
import type { BreadcrumbItem } from "@/lib/breadcrumbs";

export function PublicPageHeader({
  breadcrumbs,
  currentPath,
  description,
  eyebrow,
  title
}: {
  breadcrumbs?: BreadcrumbItem[];
  currentPath: string;
  description: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <>
      <SiteHeader actions="public-menu" className="site-header-shell--detail" />
      {breadcrumbs ? (
        <Breadcrumbs
          currentPath={currentPath}
          id={`breadcrumbs-${currentPath.replace(/[^a-z0-9]+/gi, "-")}`}
          items={breadcrumbs}
        />
      ) : null}
      <header className="discovery-page__intro">
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
    </>
  );
}
