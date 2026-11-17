export interface PerfumeItem {
  id: string;
  name: string;
  brand: string;
  estimatedPrice: number;
  savingsPercent: number;
  matchScore: number;
  olfactoryFamily: string;
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
  longevityHours: string;
  sillage: string;
  bestOccasions: string[];
  whyItMatches: string;
  pros: string[];
  badge: string;
  vibeDescription: string;
}

export interface RecommendationResponse {
  originalReference: string;
  originalEstimatedPrice: number;
  analysis: string;
  recommendations: PerfumeItem[];
  offlineFallback?: boolean;
}

export interface CatalogPerfume {
  id: number;
  name: string;
  brand: string;
  category: 'hombre' | 'mujer' | 'unisex';
  concentration: string;
  volume: string;
  price: number;
  rating: number;
  reviews: number;
  durationGlobal: string;
  durationTwins: string;
  alertaGlobal: string | null;
  alertaTwins: string | null;
  notes: {
    top: string;
    heart: string;
    base: string;
  };
  description: string;
  perfumer: string;
  year: number;
}

export interface AuthUser {
  id: number;
  username: string;
}

export interface SkinProfile {
  id?: number;
  userId?: number;
  skinType: string;
  hydration: string;
  climate: string;
  humidity: string;
  updatedAt?: string;
}

export interface SkinPrediction {
  id: number;
  name: string;
  brand: string;
  category: string;
  rating: string;
  duration: string;
  alertaTwins: string | null;
  match: number;
}

export interface SkinTwin {
  name: string;
  skin: string;
  hydration: string;
  climate: string;
  match: number;
  reviewCount: number;
  months: number;
  perfume: CatalogPerfume | null;
  quote: string;
  identical: boolean;
}
