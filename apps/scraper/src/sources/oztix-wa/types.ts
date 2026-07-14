export interface OztixVenue {
  Name?: string;
  Address?: string;
  Locality?: string;
  State?: string;
  WebsiteUrl?: string;
  Timezone?: string;
}

export interface OztixPerformance {
  Name?: string;
}

export interface OztixHit {
  EventGuid?: string;
  EventName?: string;
  SpecialGuests?: string;
  EventDescription?: string;
  HomepageImage?: string | null;
  EventImage1?: string | null;
  DateStart?: string;
  DateEnd?: string | null;
  EventUrl?: string;
  Categories?: string[];
  _geoloc?: {
    lat?: number;
    lng?: number;
  } | null;
  Venue?: OztixVenue;
  Bands?: string[];
  Performances?: OztixPerformance[];
  TourName?: string | null;
  IsCancelled?: boolean;
  IsPostponed?: boolean;
  IsRescheduled?: boolean;
  AffectedBy?: string | null;
  HasEventDatePassed?: boolean;
}
