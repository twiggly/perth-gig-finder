import React from "react";
import Link from "next/link";

import {
  buildBreadcrumbStructuredDataJson,
  type BreadcrumbItem
} from "@/lib/breadcrumbs";

export function Breadcrumbs({
  currentPath,
  id,
  items
}: {
  currentPath: string;
  id: string;
  items: BreadcrumbItem[];
}) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <ol>
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
            </li>
          ))}
        </ol>
      </nav>
      <BreadcrumbStructuredData currentPath={currentPath} id={id} items={items} />
    </>
  );
}

export function BreadcrumbStructuredData({
  currentPath,
  id,
  items
}: {
  currentPath: string;
  id: string;
  items: BreadcrumbItem[];
}) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: buildBreadcrumbStructuredDataJson(items, currentPath)
      }}
      id={id}
      type="application/ld+json"
    />
  );
}
