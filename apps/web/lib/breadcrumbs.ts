import { serializeJsonLd } from "./json-ld";
import { SITE_URL } from "./seo";

export interface BreadcrumbItem {
  href?: string;
  label: string;
}

export function buildBreadcrumbStructuredData(
  items: BreadcrumbItem[],
  currentPath: string
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      item: `${SITE_URL}${item.href ?? currentPath}`,
      name: item.label,
      position: index + 1
    }))
  };
}

export function buildBreadcrumbStructuredDataJson(
  items: BreadcrumbItem[],
  currentPath: string
): string {
  return serializeJsonLd(buildBreadcrumbStructuredData(items, currentPath));
}
