import { CatalogPerfume, SkinPrediction, SkinProfile, SkinTwin } from '../types/perfume';
import { ShareResult } from './shareService';

/* ---------- Badging API (PWA) ---------- */
export function setAppBadge(count: number): void {
  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      (navigator as any).setAppBadge(count).catch(() => {});
    } catch {
      // Ignore unsupported environments
    }
  }
}

export function clearAppBadge(): void {
  if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
    try {
      (navigator as any).clearAppBadge().catch(() => {});
    } catch {
      // Ignore unsupported environments
    }
  }
}

/* ---------- Geolocalización (GPS -> humedad local) ---------- */
export function getLocalHumidity(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve('No disponible');
  }

  const geo = new Promise<string>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const hum = Math.round(40 + Math.sin(lat / 10) * 30);
        resolve(`${hum}%`);
      },
      () => resolve('No disponible'),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });

  const fallback = new Promise<string>((resolve) => {
    setTimeout(() => resolve('No disponible'), 6000);
  });

  return Promise.race([geo, fallback]);
}

/* ---------- Predicción de fijación (Match Biológico) ---------- */
export function computePrediction(perfume: CatalogPerfume, profile: SkinProfile): SkinPrediction {
  const skin = (profile.skinType || '').toLowerCase();
  const hydration = (profile.hydration || '').toLowerCase();

  let score = perfume.rating || 3;
  let duration = '6-8 horas';

  if (skin.includes('grasa')) {
    score += 0.5;
    duration = '8-10 horas';
  } else if (skin.includes('seca')) {
    score -= 0.5;
    duration = '4-6 horas';
  }

  if (hydration.includes('alta') || hydration.includes('bien')) {
    score += 0.3;
  } else if (hydration.includes('baja') || hydration.includes('seca')) {
    score -= 0.3;
  }

  const clamped = Math.min(5, Math.max(0, score));

  return {
    id: perfume.id,
    name: perfume.name,
    brand: perfume.brand,
    category: perfume.category,
    rating: clamped.toFixed(1),
    duration,
    alertaTwins: perfume.alertaTwins || null,
    match: Math.round(Math.min(100, Math.max(0, (clamped / 5) * 100))),
  };
}

/* ---------- Gemelos de piel (PRNG determinista) ---------- */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TWINS_NAMES = [
  'María', 'Carlos', 'Lucía', 'Andrés', 'Sofía', 'Diego', 'Valeria',
  'Mateo', 'Camila', 'Jorge', 'Elena', 'Bruno', 'Paula', 'Iker', 'Nadia', 'Óscar',
];
const TWINS_SURNAMES = ['G.', 'R.', 'M.', 'T.', 'S.', 'V.', 'L.', 'C.'];

const TWINS_QUOTES_SAME = [
  'En mi piel, idéntica a la tuya, me duró casi lo que prometía el catálogo.',
  'Idéntico resultado al tuyo: la nota del corazón se apaga un poco antes.',
  'En pieles como la nuestra se siente más ámbar que en otras.',
];

const TWINS_QUOTES_CLOSE = [
  'Mi piel es prácticamente gemela a la tuya y me aguantó una hora más.',
  'Hidrato un poco más y me duró igual: ajusta tu capa neutra.',
  'Con el mismo clima que tú, el dulzor se intensifica en la salida.',
];

function similarHydration(hydration: string): string {
  const order = ['Alta', 'Media', 'Baja'];
  const idx = order.findIndex((o) => hydration.startsWith(o));
  if (idx < 0) return hydration || 'Media';
  return order[Math.min(order.length - 1, idx + 1)];
}

function similarClimate(climate: string): string {
  if (climate.includes('Cálido y húmedo')) return 'Cálido y seco';
  if (climate.includes('Cálido y seco')) return 'Cálido y húmedo';
  if (climate.includes('Templado')) return 'Frío';
  return 'Templado';
}

export function generateSkinTwins(
  profile: SkinProfile,
  catalog: CatalogPerfume[],
  userId?: number | string
): SkinTwin[] {
  const seed = hashSeed(
    [userId ?? 'guest', profile.skinType, profile.hydration, profile.climate].join('|')
  );
  const rnd = mulberry32(seed);

  const best = catalog
    .slice()
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 6);

  const twins: SkinTwin[] = [];
  for (let i = 0; i < 4; i++) {
    const sameHydration = rnd() < 0.7;
    const sameClimate = rnd() < 0.65;
    const hydration = sameHydration
      ? profile.hydration
      : similarHydration(profile.hydration || '');
    const climate = sameClimate
      ? profile.climate
      : similarClimate(profile.climate || '');

    let match = 86 + rnd() * 10;
    if (sameHydration) match += 1.5;
    if (sameClimate) match += 1.5;
    match = Math.min(99, Math.round(match));

    const reviewCount = 18 + Math.floor(rnd() * 130);
    const months = 2 + Math.floor(rnd() * 22);
    const perfume = best.length ? best[Math.floor(rnd() * best.length)] : null;
    const name =
      TWINS_NAMES[Math.floor(rnd() * TWINS_NAMES.length)] +
      ' ' +
      TWINS_SURNAMES[Math.floor(rnd() * TWINS_SURNAMES.length)];

    const identical = sameHydration && sameClimate;
    const quotes = identical ? TWINS_QUOTES_SAME : TWINS_QUOTES_CLOSE;
    const quote = quotes[Math.floor(rnd() * quotes.length)];

    twins.push({
      name,
      skin: profile.skinType,
      hydration,
      climate,
      match,
      reviewCount,
      months,
      perfume,
      quote,
      identical,
    });
  }

  twins.sort((a, b) => b.match - a.match);
  return twins;
}

/* ---------- Web Share API para fragancias del catálogo ---------- */
export async function shareCatalogPerfume(perfume: CatalogPerfume): Promise<ShareResult> {
  const shareTitle = `${perfume.name} — ${perfume.brand}`;
  const shareText = `Mira esta fragancia en Aura x Gemelos de Piel: ${perfume.name} (${perfume.brand}) · ${perfume.rating.toFixed(1)}★ · ${perfume.concentration}`;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : 'https://aura.app';

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      return { shared: true, method: 'native', message: 'Compartido correctamente' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { shared: false, method: 'native', message: 'Compartir cancelado' };
      }
    }
  }

  try {
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    return { shared: true, method: 'clipboard', message: 'Enlace y detalles copiados al portapapeles' };
  } catch {
    return { shared: false, method: 'clipboard', message: 'No se pudo compartir la fragancia' };
  }
}
