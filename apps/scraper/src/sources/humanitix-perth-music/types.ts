export interface HumanitixStructuredAddress {
  "@type"?: string | string[];
  streetAddress?: string;
  addressLocality?: string;
  postalCode?: string;
  addressRegion?: string;
  addressCountry?: string;
}

interface HumanitixStructuredPlace {
  "@type"?: string | string[];
  name?: string;
  address?: HumanitixStructuredAddress | string;
  url?: string;
}

interface HumanitixStructuredOffer {
  "@type"?: string | string[];
  url?: string;
  name?: string;
  price?: number | string;
  availability?: string;
}

interface HumanitixStructuredPerformer {
  "@type"?: string | string[];
  name?: string;
  description?: string;
}

export interface HumanitixStructuredEvent {
  "@context"?: string;
  "@type"?: string | string[];
  name?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  location?: HumanitixStructuredPlace | string;
  eventStatus?: string;
  eventAttendanceMode?: string;
  description?: string;
  image?: string | string[];
  offers?: HumanitixStructuredOffer | HumanitixStructuredOffer[];
  performers?: HumanitixStructuredPerformer | HumanitixStructuredPerformer[];
  performer?: HumanitixStructuredPerformer | HumanitixStructuredPerformer[];
}

export interface HumanitixPageMeta {
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  twitterLocation: string | null;
  twitterDate: string | null;
  eventId: string | null;
  pageText: string[];
  headings: string[];
  lineupText: string[];
}

export interface ParsedHumanitixDiscoveryPage {
  eventUrls: string[];
  nextPageUrls: string[];
  failedCount: number;
}
