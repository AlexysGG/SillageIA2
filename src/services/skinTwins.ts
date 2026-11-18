import { CatalogPerfume, SkinPrediction, SkinProfile, SkinTwin } from '../types/perfume';
import { ShareResult } from './shareService';

/* ---------- Badging API (PWA) ---------- */
export function setAppBadge(count: number): void {
  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      (navigator as any).setAppBadge(count).catch(() => { });
    } catch {
      // Ignore unsupported environments
    }
  }
}

export function clearAppBadge(): void {
  if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
    try {
      (navigator as any).clearAppBadge().catch(() => { });
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
  const climate = (profile.climate || '').toLowerCase();
  const notesText = `${perfume.notes.top} ${perfume.notes.heart} ${perfume.notes.base}`.toLowerCase();
  const isEdt = (perfume.concentration || '').toLowerCase().includes('toilette');
  const isHeavy =
    notesText.includes('oud') ||
    notesText.includes('vainilla') ||
    notesText.includes('praliné') ||
    notesText.includes('cacao') ||
    notesText.includes('ámbar');
  const isCitrusFresh =
    notesText.includes('bergamota') ||
    notesText.includes('limón') ||
    notesText.includes('toronja') ||
    notesText.includes('mar') ||
    notesText.includes('menta');

  let score = perfume.rating || 4.0;
  let match = Math.round((score / 5) * 86); // base 72–82
  let duration = isEdt ? '5-7 horas' : '7-9 horas';

  if (skin.includes('grasa')) {
    score += isEdt ? 0.2 : 0.15;
    duration = isEdt ? '7-8 horas' : '9-11 horas';
    match += isHeavy && climate.includes('cálido') ? 3 : 8;
  } else if (skin.includes('seca')) {
    score -= isEdt ? 0.45 : 0.25;
    duration = isEdt ? '3.5-5 horas' : '5-7 horas';
    match += isHeavy ? 2 : -6;
  } else if (skin.includes('mixta')) {
    score += 0.1;
    duration = isEdt ? '5.5-7 horas' : '7.5-9.5 horas';
    match += 6;
  } else if (skin.includes('sensible')) {
    score -= isCitrusFresh ? 0.15 : 0.05;
    duration = isEdt ? '5-6.5 horas' : '7-8.5 horas';
    match += isHeavy ? -2 : 4;
  } else {
    // Normal
    score += 0.1;
    match += 6;
  }

  if (hydration.includes('alta')) {
    score += 0.15;
    match += 4;
  } else if (hydration.includes('baja')) {
    score -= 0.25;
    match -= 6;
  } else {
    match += 1;
  }

  if (climate.includes('húmedo') && isHeavy) {
    match -= 3;
  } else if (climate.includes('frío') && isHeavy) {
    match += 4;
  }

  const clampedScore = Math.min(4.9, Math.max(3.2, score));
  const clampedMatch = Math.min(98, Math.max(64, match));

  // Alerta personalizada coherente con el perfil del usuario (sin contradicciones)
  let alertaPersonalizada: string | null = null;
  if (skin.includes('grasa')) {
    if (isHeavy && climate.includes('cálido')) {
      alertaPersonalizada = `En piel grasa y clima ${profile.climate}, las notas densas proyectan fuerte: usa 2–3 atomizaciones.`;
    } else if (isCitrusFresh) {
      alertaPersonalizada = `En piel grasa, la salida cítrica se suaviza rápido y da paso al fondo amaderado.`;
    } else {
      alertaPersonalizada = `Tu piel grasa fija muy bien el corazón y fondo de ${perfume.name} (${duration}).`;
    }
  } else if (skin.includes('seca')) {
    alertaPersonalizada = `En piel seca la evaporación es más rápida: aplica crema neutra antes para ganar +2 horas.`;
  } else if (hydration.includes('baja')) {
    alertaPersonalizada = `Con hidratación baja, las notas de salida duran menos; hidrata la zona antes de atomizar.`;
  } else if (skin.includes('sensible')) {
    alertaPersonalizada = `En piel sensible, prueba primero en muñeca o aplica sobre la ropa para evitar irritación.`;
  } else {
    alertaPersonalizada =
      isHeavy && climate.includes('cálido')
        ? `En clima ${profile.climate}, las notas dulces o ambaradas proyectan más: modera las atomizaciones.`
        : isCitrusFresh
        ? `La salida cítrica se siente fresca en los primeros minutos antes de asentarse en el fondo.`
        : `Comportamiento equilibrado en tu piel ${profile.skinType}: evolución y secado estables (${duration}).`;
  }

  return {
    id: perfume.id,
    name: perfume.name,
    brand: perfume.brand,
    category: perfume.category,
    rating: clampedScore.toFixed(1),
    duration,
    alertaTwins: alertaPersonalizada,
    match: clampedMatch,
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
