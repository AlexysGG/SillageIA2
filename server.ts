import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { CATALOG_PERFUMES } from './src/data/catalogPerfumes.ts';
import {
  isSupabaseConfigured,
  fetchSupabaseReviews,
  insertSupabaseReview,
  fetchSupabaseUserByUsername,
  insertSupabaseUser,
  fetchSupabaseProfile,
  upsertSupabaseProfile,
} from './server/supabase.ts';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.env.local') });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'aura-gemelos-piel-secret-2026';

app.use(express.json());

// ============================================================
// Lightweight JSON Store + Auth/Session (Zero native deps)
// ============================================================
interface StoredUser {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: string;
}

interface StoredSkinProfile {
  id: number;
  user_id: number;
  skin_type: string;
  hydration: string;
  climate: string;
  humidity: string | null;
  created_at: string;
  updated_at: string;
}

interface StoredReview {
  id: string;
  perfumeId: number;
  userId?: number | null;
  author: string;
  skinType: string;
  hydration: string;
  climate: string;
  rating: number;
  duration: string;
  sillage?: string;
  occasion?: string;
  target: 'global' | 'twins' | 'both';
  comment: string;
  createdAt: string;
}

interface StoreData {
  users: StoredUser[];
  profiles: StoredSkinProfile[];
  reviews: StoredReview[];
}

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

function readStore(): StoreData {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { users: [], profiles: [], reviews: [] };
    }
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
    };
  } catch {
    return { users: [], profiles: [], reviews: [] };
  }
}

function writeStore(data: StoreData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing store.json:', err);
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function signSession(payload: { id: number; username: string }): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySession(token: string | undefined): { id: number; username: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

function getSessionUser(req: express.Request): { id: number; username: string } | null {
  const cookies = parseCookies(req.headers.cookie);
  return verifySession(cookies['aura_session']);
}

function setSessionCookie(res: express.Response, user: { id: number; username: string }) {
  const token = signSession(user);
  res.setHeader(
    'Set-Cookie',
    `aura_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`
  );
}

function clearSessionCookie(res: express.Response) {
  res.setHeader('Set-Cookie', 'aura_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

// Perfume recommendation fallback curated data
interface PerfumeItem {
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
  comparison?: {
    opening: number;
    drydown: number;
    longevity: number;
    projection: number;
  };
}

const FALLBACK_CATALOG: Record<string, { original: string; originalPrice: number; items: PerfumeItem[] }> = {
  'club_de_nuit': {
    original: 'Club de Nuit Intense Man (Armaf) / Creed Aventus',
    originalPrice: 980,
    items: [
      {
        id: 'zara-vibrant-leather',
        name: 'Vibrant Leather Eau de Parfum',
        brand: 'Zara',
        estimatedPrice: 520,
        savingsPercent: 47,
        matchScore: 92,
        olfactoryFamily: 'Amaderado Cítrico Cuero',
        topNotes: ['Bergamota', 'Limón'],
        heartNotes: ['Bambú', 'Flor de azahar'],
        baseNotes: ['Cuero', 'Pachulí'],
        longevityHours: '5 - 6 hrs',
        sillage: 'Moderada / Cercana',
        bestOccasions: ['Oficina diaria', 'Clima cálido', 'Salidas casuales'],
        whyItMatches: 'Ofrece el mismo ADN afrutado ahumado de Club de Nuit pero con una salida mucho más limpia y natural, sin la nota sintética punzante de limón que algunos critican.',
        pros: ['Salida sin aroma químico', 'Precio imbatible', 'Fácil de encontrar en tiendas físicas'],
        badge: 'Opción más limpia & barata',
        vibeDescription: 'Elegancia cotidiana relajada con fondo cítrico y cuero refinado.',
        comparison: { opening: 88, drydown: 92, longevity: 76, projection: 78 }
      },
      {
        id: 'lattafa-shaheen-silver',
        name: 'Shaheen Silver',
        brand: 'Lattafa Pride',
        estimatedPrice: 620,
        savingsPercent: 37,
        matchScore: 94,
        olfactoryFamily: 'Cítrico Amaderado Especiado',
        topNotes: ['Bergamota', 'Cassis'],
        heartNotes: ['Pachulí', 'Rosa'],
        baseNotes: ['Musgo de roble', 'Almizcle', 'Ámbar'],
        longevityHours: '7 - 8 hrs',
        sillage: 'Moderada a Fuerte',
        bestOccasions: ['Tardes', 'Reuniones de trabajo', 'Primavera / Otoño'],
        whyItMatches: 'Gran clon con corazón de musgo de roble y pachulí que replica el secado ahumado distintivo con excelente fijación a un precio aún más accesible.',
        pros: ['Presentación premium en botella de metal pesado', 'Excelente duración', 'Secado casi idéntico al Creed vintage'],
        badge: 'Mejor fijación económica',
        vibeDescription: 'Aroma magnético, maduro y con presencia envolvente.',
        comparison: { opening: 91, drydown: 95, longevity: 88, projection: 86 }
      },
      {
        id: 'antonio-banderas-icon',
        name: 'The Icon Elixir',
        brand: 'Antonio Banderas',
        estimatedPrice: 450,
        savingsPercent: 54,
        matchScore: 88,
        olfactoryFamily: 'Amaderado Aromático Especiado',
        topNotes: ['Cítricos', 'Cardamomo'],
        heartNotes: ['Lavanda', 'Salvia'],
        baseNotes: ['Abedul ahumado', 'Cedro', 'Ámbar'],
        longevityHours: '6 hrs',
        sillage: 'Moderada',
        bestOccasions: ['Universidad', 'Gimnasio & diario', 'Clima templado'],
        whyItMatches: 'Para presupuestos muy ajustados, incorpora la faceta ahumada del abedul con un acorde fresco y cítrico muy complaciente.',
        pros: ['Menos de $500 MXN', 'Fácil de gustar a cualquier persona', 'Muy versátil'],
        badge: 'Ultra Low-Cost',
        vibeDescription: 'Fresco, dinámico y amigable para el uso diario sin complicaciones.',
        comparison: { opening: 84, drydown: 86, longevity: 74, projection: 75 }
      },
      {
        id: 'afnan-supremacy-silver',
        name: 'Supremacy Silver',
        brand: 'Afnan',
        estimatedPrice: 740,
        savingsPercent: 24,
        matchScore: 96,
        olfactoryFamily: 'Amaderado Floral Almizcle',
        topNotes: ['Manzana', 'Bergamota', 'Grosella negra', 'Piña'],
        heartNotes: ['Rosa', 'Abedul', 'Jazmín marroquí', 'Pachulí'],
        baseNotes: ['Musgo de roble', 'Almizcle', 'Ámbar gris', 'Vainilla'],
        longevityHours: '8 - 10 hrs',
        sillage: 'Fuerte',
        bestOccasions: ['Eventos formales', 'Noches de fiesta', 'Citas'],
        whyItMatches: 'Considerado por la comunidad perfumista como una versión más refinada y equilibrada que Club de Nuit, con nota de piña jugosa más prominente.',
        pros: ['Aroma más natural que Armaf', 'Proyección estelar', 'Frasco de colección pesado'],
        badge: 'Calidad Olfativa Superior',
        vibeDescription: 'Proyección imponente y magnetismo frutal con humo suave de abedul.',
        comparison: { opening: 94, drydown: 96, longevity: 92, projection: 90 }
      }
    ]
  }
};

// API Endpoint for Perfume Consultations
app.post('/api/recommend-perfumes', async (req, res) => {
  try {
    const { query, maxPrice = 50, minPrice = 0, skinProfile } = req.body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return res.status(400).json({ error: 'La consulta no puede estar vacía' });
    }

    const trimmedQuery = query.trim();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('GEMINI_API_KEY not configured, using smart curated sommelier response');
      return res.json(getCuratedResponse(trimmedQuery, minPrice, maxPrice, skinProfile));
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const skinContext = skinProfile
      ? `\nContexto biológico del usuario (Gemelos de Piel): Tipo de piel "${skinProfile.skinType}", Hidratación "${skinProfile.hydration}", Clima "${skinProfile.climate}", Humedad "${skinProfile.humidity}". Ajusta tus consejos de fijación y por qué combina con su piel.`
      : '';

    const systemInstruction = `Eres un sumiller y perfumista experto en fragancias masculinas, femeninas y unisex, especializado en clones, "dupes" accesibles, casas de nicho y opciones con la mejor relación calidad-precio (como Armaf, Lattafa, Afnan, Zara, Maison Alhambra, Rasasi, etc.).
Tu misión es interpretar la petición del usuario en español, identificar la fragancia de referencia si existe, y sugerir alternativas excelentes y económicas en México que se ajusten a su presupuesto estricto en Pesos Mexicanos (MXN) (máximo $${maxPrice} MXN / mínimo $${minPrice} MXN).${skinContext}

Reglas fundamentales:
1. Prioriza opciones reales, comerciales y reconocidas con precios realistas en el mercado mexicano expresados SIEMPRE en Pesos Mexicanos (MXN).
2. Si el usuario pide algo más barato que X perfume (por ejemplo "Club de nuit más barato"), debes recomendar dupes cuyo precio estimado en MXN sea menor al de referencia y dentro del rango especificado (menor a $${maxPrice} MXN).
3. Detalla las notas olfativas reales (Salida, Corazón, Fondo), la longevidad en horas y la estela.
4. En 'whyItMatches', explica con lenguaje accesible pero profesional por qué se parece, qué matices cambian (ej. salida más cítrica o menos ahumada) y por qué vale la pena.
5. Incluye en 'comparison' puntuaciones de 0 a 100 comparando el dupe contra el original en Salida (opening), Secado (drydown), Duración (longevity) y Proyección (projection).
6. Devuelve siempre entre 3 y 5 recomendaciones relevantes.`;

    const prompt = `Consulta del usuario: "${trimmedQuery}".
Filtro de presupuesto en Pesos Mexicanos (MXN):
- Precio máximo deseado: $${maxPrice} MXN
- Precio mínimo: $${minPrice} MXN

Genera un JSON estructurado con el perfume original de referencia identificado, su precio aproximado en MXN, un resumen amigable para el usuario y la lista de mejores opciones que cumplan con el presupuesto en MXN.`;

    const modelCandidates = [
      process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ];

    let response: any = null;
    let lastModelError: any = null;

    for (const modelName of modelCandidates) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                originalReference: {
                  type: Type.STRING,
                  description: 'Nombre del perfume original de referencia o estilo olfativo buscado',
                },
                originalEstimatedPrice: {
                  type: Type.NUMBER,
                  description: 'Precio estimado en Pesos Mexicanos (MXN) del perfume original de referencia',
                },
                analysis: {
                  type: Type.STRING,
                  description: 'Breve explicación en español del perfil de aroma y la estrategia de dupes encontrada',
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING, description: 'Nombre de la fragancia recomendada' },
                      brand: { type: Type.STRING, description: 'Casa o marca de perfumes' },
                      estimatedPrice: { type: Type.NUMBER, description: 'Precio estimado en Pesos Mexicanos (MXN)' },
                      savingsPercent: { type: Type.NUMBER, description: 'Porcentaje estimado de ahorro frente al original' },
                      matchScore: { type: Type.INTEGER, description: 'Afinidad o similitud porcentual (0 a 100)' },
                      olfactoryFamily: { type: Type.STRING, description: 'Familia olfativa (ej: Cítrico Amaderado Cuero)' },
                      topNotes: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Notas de salida (primeros 15 min)'
                      },
                      heartNotes: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Notas de corazón'
                      },
                      baseNotes: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Notas de fondo'
                      },
                      longevityHours: { type: Type.STRING, description: 'Ej: 6 - 8 horas' },
                      sillage: { type: Type.STRING, description: 'Estela (Intensa, Moderada, Íntima)' },
                      bestOccasions: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Ocasiones recomendadas'
                      },
                      whyItMatches: { type: Type.STRING, description: 'Por qué es una alternativa ideal y cómo se compara' },
                      pros: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Puntos fuertes destacados'
                      },
                      badge: { type: Type.STRING, description: 'Insignia corta (ej: Mejor Precio, Más Versátil, Gran Estela)' },
                      vibeDescription: { type: Type.STRING, description: 'Descripción de la vibra o atmósfera en una frase' },
                      comparison: {
                        type: Type.OBJECT,
                        properties: {
                          opening: { type: Type.INTEGER, description: 'Similitud en salida (0-100)' },
                          drydown: { type: Type.INTEGER, description: 'Similitud en secado (0-100)' },
                          longevity: { type: Type.INTEGER, description: 'Rendimiento en duración (0-100)' },
                          projection: { type: Type.INTEGER, description: 'Rendimiento en proyección (0-100)' },
                        },
                        required: ['opening', 'drydown', 'longevity', 'projection'],
                      }
                    },
                    required: [
                      'id', 'name', 'brand', 'estimatedPrice', 'savingsPercent', 'matchScore',
                      'olfactoryFamily', 'topNotes', 'heartNotes', 'baseNotes', 'longevityHours',
                      'sillage', 'bestOccasions', 'whyItMatches', 'pros', 'badge', 'vibeDescription', 'comparison'
                    ]
                  }
                }
              },
              required: ['originalReference', 'originalEstimatedPrice', 'analysis', 'recommendations']
            }
          }
        });
        if (response?.text) break;
      } catch (err) {
        lastModelError = err;
        console.warn(`Gemini model "${modelName}" failed:`, (err as any)?.message || err);
      }
    }

    if (!response?.text) {
      throw lastModelError || new Error('Respuesta vacía del modelo Gemini');
    }

    const text = response.text;
    if (!text) {
      throw new Error('Respuesta vacía del modelo Gemini');
    }

    const parsedData = JSON.parse(text);
    return res.json(parsedData);
  } catch (error) {
    console.error('Error invoking Gemini API:', error);
    // Graceful fallback with curated perfumes matching user request
    const { query = '', maxPrice = 50, minPrice = 0, skinProfile } = req.body || {};
    const fallback = getCuratedResponse(query, minPrice, maxPrice, skinProfile);
    return res.json(fallback);
  }
});

// API Endpoint for Vibe Translator ("Traductor de Vibes")
app.post('/api/translate-vibe', async (req, res) => {
  try {
    const { vibe, maxPrice = 120, skinProfile } = req.body || {};

    if (!vibe || typeof vibe !== 'string' || vibe.trim() === '') {
      return res.status(400).json({ error: 'Describe una vibra, lugar o sensación olfativa' });
    }

    const trimmedVibe = vibe.trim();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('GEMINI_API_KEY not configured, using curated vibe translator response');
      return res.json(getCuratedVibeResponse(trimmedVibe, maxPrice, skinProfile));
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const skinContext = skinProfile
      ? `\nContexto biológico del usuario (Gemelos de Piel): Tipo de piel "${skinProfile.skinType}", Hidratación "${skinProfile.hydration}", Clima "${skinProfile.climate}". Adapta tus consejos de fijación y proyección a su piel.`
      : '';

    const systemInstruction = `Eres un director creativo de perfumería y "Traductor de Vibes" olfativo.
Tu especialidad es traducir sensaciones abstractas, lugares, atmósferas, recuerdos o estados de ánimo (por ejemplo: "quiero oler a bosque húmedo", "librería antigua con café", "ropa limpia al sol", "noche lluviosa en Tokio") en perfumes reales y comerciales que evoquen exactamente esa vibra.${skinContext}

Reglas fundamentales:
1. Analiza la vibra descrita e identifícala con notas olfativas concretas (ej. pino, musgo de roble, cedro, petrichor, vetiver para "bosque").
2. Recomienda entre 3 y 4 perfumes REALES y reconocidos en el mercado que capturen esa atmósfera, respetando el presupuesto máximo de $${maxPrice} MXN (Pesos Mexicanos) cuando sea posible (incluyendo tanto joyas accesibles como clásicos icónicos si encajan en el límite).
3. En 'whyItMatches', explica con detalle sensorial por qué ese perfume huele exactamente a esa vibra o escena.
4. Devuelve siempre un JSON válido en español con precios estimados en Pesos Mexicanos (MXN) siguiendo el esquema.`;

    const prompt = `Vibra o sensación solicitada por el usuario: "${trimmedVibe}".
Presupuesto máximo deseado: $${maxPrice} MXN (Pesos Mexicanos).

Traduce esta vibra a una paleta olfativa y recomienda los mejores perfumes reales que hagan referencia o capturen ese olor.`;

    const modelCandidates = [
      process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ];

    let response: any = null;
    let lastModelError: any = null;

    for (const modelName of modelCandidates) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                vibeQuery: { type: Type.STRING, description: 'La vibra original consultada' },
                vibeInterpreted: {
                  type: Type.STRING,
                  description: 'Título poético y preciso de la atmósfera olfativa interpretada',
                },
                olfactoryPalette: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '4 a 6 notas o acordes clave que representan esa vibra',
                },
                atmosphereSummary: {
                  type: Type.STRING,
                  description: 'Explicación breve en español de cómo se traduce esa vibra al mundo del perfume',
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      brand: { type: Type.STRING },
                      estimatedPrice: { type: Type.NUMBER },
                      savingsPercent: { type: Type.NUMBER },
                      matchScore: { type: Type.INTEGER },
                      olfactoryFamily: { type: Type.STRING },
                      topNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
                      heartNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
                      baseNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
                      longevityHours: { type: Type.STRING },
                      sillage: { type: Type.STRING },
                      bestOccasions: { type: Type.ARRAY, items: { type: Type.STRING } },
                      whyItMatches: { type: Type.STRING },
                      pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                      badge: { type: Type.STRING },
                      vibeDescription: { type: Type.STRING },
                    },
                    required: [
                      'id', 'name', 'brand', 'estimatedPrice', 'savingsPercent', 'matchScore',
                      'olfactoryFamily', 'topNotes', 'heartNotes', 'baseNotes', 'longevityHours',
                      'sillage', 'bestOccasions', 'whyItMatches', 'pros', 'badge', 'vibeDescription'
                    ],
                  },
                },
              },
              required: [
                'vibeQuery',
                'vibeInterpreted',
                'olfactoryPalette',
                'atmosphereSummary',
                'recommendations',
              ],
            },
          },
        });
        if (response?.text) break;
      } catch (err) {
        lastModelError = err;
        console.warn(`Gemini vibe model "${modelName}" failed:`, (err as any)?.message || err);
      }
    }

    if (!response?.text) {
      throw lastModelError || new Error('Respuesta vacía del modelo Gemini');
    }

    const parsedData = JSON.parse(response.text);
    return res.json(parsedData);
  } catch (error) {
    console.error('Error invoking Gemini API (Vibe Translator):', error);
    const { vibe = '', maxPrice = 120, skinProfile } = req.body || {};
    return res.json(getCuratedVibeResponse(vibe, maxPrice, skinProfile));
  }
});

app.post('/api/push/subscribe', (req, res) => {
  res.json({ success: true, message: 'Push subscription received' });
});

app.post('/api/push/send-test', (req, res) => {
  res.json({ success: true, message: 'Test notification triggered' });
});

// ============================================================
// SillageAI: Catálogo de Perfumes, Reseñas, Auth y Gemelos de Piel
// ============================================================
function enrichPerfumeWithReviews(perfume: (typeof CATALOG_PERFUMES)[number], allReviews: StoredReview[]) {
  const userRevs = allReviews.filter((r) => r.perfumeId === perfume.id);
  if (userRevs.length === 0) return perfume;

  // Ponderación: base histórica con peso 10 para que las reseñas reales de usuarios reflejen cambio visible en rating y % match
  const baseWeight = 10;
  const userSum = userRevs.reduce((acc, r) => acc + Number(r.rating || 0), 0);
  const updatedRating = Number(((perfume.rating * baseWeight + userSum) / (baseWeight + userRevs.length)).toFixed(2));

  return {
    ...perfume,
    rating: updatedRating,
    reviews: perfume.reviews + userRevs.length,
  };
}

app.get('/api/supabase/status', (_req, res) => {
  res.json({
    configured: isSupabaseConfigured(),
    mode: isSupabaseConfigured() ? 'supabase+local_presets' : 'local_json_store+local_presets',
  });
});

app.get('/api/perfumes', async (_req, res) => {
  const supabaseReviews = await fetchSupabaseReviews();
  const reviews = supabaseReviews ?? readStore().reviews;
  res.json(CATALOG_PERFUMES.map((p) => enrichPerfumeWithReviews(p, reviews)));
});

app.get('/api/perfumes/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const perfume = CATALOG_PERFUMES.find((p) => p.id === id);
  if (!perfume) return res.status(404).json({ error: 'Perfume not found' });
  const supabaseReviews = await fetchSupabaseReviews(id);
  const reviews = supabaseReviews ?? readStore().reviews;
  res.json(enrichPerfumeWithReviews(perfume, reviews));
});

app.get('/api/perfumes/:id/reviews', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const supabaseReviews = await fetchSupabaseReviews(id);
  if (supabaseReviews !== null) {
    return res.json(supabaseReviews);
  }
  const store = readStore();
  const list = store.reviews
    .filter((r) => r.perfumeId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json(list);
});

app.post('/api/perfumes/:id/reviews', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const perfume = CATALOG_PERFUMES.find((p) => p.id === id);
  if (!perfume) return res.status(404).json({ error: 'Perfume not found' });

  const sessionUser = getSessionUser(req);
  const {
    author,
    skinType = 'General',
    hydration = 'Media',
    climate = 'Templado',
    rating = 5,
    duration = '6-8 horas',
    sillage = 'Moderada',
    occasion = 'Uso diario',
    target = 'both',
    comment,
  } = req.body || {};

  if (!comment || typeof comment !== 'string' || !comment.trim()) {
    return res.status(400).json({ error: 'El comentario de la reseña es requerido' });
  }

  const newReview: StoredReview = {
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    perfumeId: id,
    userId: sessionUser?.id || null,
    author: sessionUser?.username || String(author || 'Usuario').trim(),
    skinType: String(skinType),
    hydration: String(hydration),
    climate: String(climate),
    rating: Math.min(5, Math.max(1, Number(rating) || 5)),
    duration: String(duration),
    sillage: String(sillage),
    occasion: String(occasion),
    target: target === 'global' || target === 'twins' || target === 'both' ? target : 'both',
    comment: comment.trim(),
    createdAt: new Date().toISOString(),
  };

  // Si Supabase está configurado, las reseñas nuevas se guardan directo en Supabase.
  const insertedInSupabase = await insertSupabaseReview(newReview);
  let allReviewsForPerfume: StoredReview[];

  if (insertedInSupabase) {
    allReviewsForPerfume = (await fetchSupabaseReviews(id)) ?? [insertedInSupabase];
  } else {
    const store = readStore();
    store.reviews.unshift(newReview);
    writeStore(store);
    allReviewsForPerfume = store.reviews;
  }

  const updatedPerfume = enrichPerfumeWithReviews(perfume, allReviewsForPerfume);
  return res.status(201).json({
    review: insertedInSupabase || newReview,
    perfume: updatedPerfume,
    storage: insertedInSupabase ? 'supabase' : 'local',
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  const cleanUser = username.trim();
  if (cleanUser.length < 2 || password.length < 3) {
    return res.status(400).json({ error: 'Usuario (mín. 2) y contraseña (mín. 3) requeridos' });
  }

  const store = readStore();
  const existingSupaUser = await fetchSupabaseUserByUsername(cleanUser);
  if (
    existingSupaUser ||
    store.users.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())
  ) {
    return res.status(400).json({ error: 'El nombre de usuario ya existe' });
  }

  const passwordHash = hashPassword(password);
  const supaUser = await insertSupabaseUser(cleanUser, passwordHash);

  if (supaUser) {
    setSessionCookie(res, { id: supaUser.id, username: supaUser.username });
    return res.status(201).json({ id: supaUser.id, username: supaUser.username, storage: 'supabase' });
  }

  const nextId = store.users.reduce((m, u) => Math.max(m, u.id), 0) + 1;
  const newUser: StoredUser = {
    id: nextId,
    username: cleanUser,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  store.users.push(newUser);
  writeStore(store);

  setSessionCookie(res, { id: newUser.id, username: newUser.username });
  return res.status(201).json({ id: newUser.id, username: newUser.username, storage: 'local' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const supaUser = await fetchSupabaseUserByUsername(String(username));
  if (supaUser && verifyPassword(String(password), supaUser.passwordHash)) {
    setSessionCookie(res, { id: supaUser.id, username: supaUser.username });
    return res.json({ id: supaUser.id, username: supaUser.username, message: 'Sesión iniciada' });
  }

  const store = readStore();
  const user = store.users.find((u) => u.username.toLowerCase() === String(username).trim().toLowerCase());
  if (!user || !verifyPassword(String(password), user.passwordHash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  setSessionCookie(res, { id: user.id, username: user.username });
  return res.json({ id: user.id, username: user.username, message: 'Sesión iniciada' });
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  return res.json(user);
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  return res.json({ message: 'Logged out successfully' });
});

app.get('/api/user/profile', async (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const supaProfile = await fetchSupabaseProfile(user.id);
  if (supaProfile) return res.json(supaProfile);

  const store = readStore();
  const profile = store.profiles.find((p) => p.user_id === user.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  return res.json(profile);
});

app.post('/api/user/profile', async (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const { skin_type, hydration, climate, humidity } = req.body || {};
  if (!skin_type || !hydration || !climate) {
    return res.status(400).json({ error: 'skin_type, hydration y climate son requeridos' });
  }

  const supaProfile = await upsertSupabaseProfile(user.id, {
    skin_type,
    hydration,
    climate,
    humidity: humidity || null,
  });
  if (supaProfile) {
    return res.status(201).json({
      id: supaProfile.id,
      user_id: user.id,
      message: 'Profile saved in Supabase',
      storage: 'supabase',
    });
  }

  const store = readStore();
  const now = new Date().toISOString();
  const existingIdx = store.profiles.findIndex((p) => p.user_id === user.id);

  if (existingIdx >= 0) {
    store.profiles[existingIdx] = {
      ...store.profiles[existingIdx],
      skin_type,
      hydration,
      climate,
      humidity: humidity || null,
      updated_at: now,
    };
    writeStore(store);
    return res.json({
      id: store.profiles[existingIdx].id,
      user_id: user.id,
      message: 'Profile updated',
    });
  }

  const nextId = store.profiles.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const created: StoredSkinProfile = {
    id: nextId,
    user_id: user.id,
    skin_type,
    hydration,
    climate,
    humidity: humidity || null,
    created_at: now,
    updated_at: now,
  };
  store.profiles.push(created);
  writeStore(store);
  return res.status(201).json({ id: created.id, user_id: user.id, message: 'Profile created' });
});

// Web Share Target (PWA): recibir compartidos y abrir búsqueda
app.get('/share-target', (req, res) => {
  const q = String(req.query.url || req.query.text || req.query.title || '');
  res.redirect('/' + (q ? '?q=' + encodeURIComponent(q) : ''));
});

function adaptRecommendationsToSkin(items: PerfumeItem[], skinProfile?: any): PerfumeItem[] {
  if (!skinProfile || !skinProfile.skinType) return items;
  const skin = String(skinProfile.skinType).toLowerCase();
  const hydration = String(skinProfile.hydration || 'Media');
  const climate = String(skinProfile.climate || 'Templado');

  return items.map((item) => {
    let scoreDelta = 0;
    let skinTip = `Adaptado a piel ${skinProfile.skinType} (hidratación ${hydration}, clima ${climate}).`;
    let adjustedLongevity = item.longevityHours;

    if (skin.includes('grasa')) {
      scoreDelta = 2;
      adjustedLongevity = `${item.longevityHours} (+1-2h en piel grasa)`;
      skinTip = `En piel grasa retiene mejor las notas de fondo; aplica con moderación.`;
    } else if (skin.includes('seca')) {
      scoreDelta = -2;
      adjustedLongevity = `${item.longevityHours} (usa crema neutra antes)`;
      skinTip = `En piel seca puede evaporarse antes; hidrata la zona antes de aplicar.`;
    } else if (skin.includes('sensible')) {
      skinTip = `En piel sensible conviene probar primero en muñeca o aplicar sobre ropa.`;
    }

    return {
      ...item,
      matchScore: Math.min(99, Math.max(70, item.matchScore + scoreDelta)),
      longevityHours: adjustedLongevity,
      whyItMatches: `${item.whyItMatches} ${skinTip}`,
    };
  });
}

function getCuratedResponse(query: string, minPrice: number, maxPrice: number, skinProfile?: any) {
  const q = query.toLowerCase();
  const skinNote = skinProfile?.skinType
    ? ` Adaptado a tu perfil cutáneo (${skinProfile.skinType}, hidratación ${skinProfile.hydration || 'Media'}).`
    : '';

  if (q.includes('club de nuit') || q.includes('aventus') || q.includes('creed') || q.includes('ahumado') || q.includes('piña') || q.includes('barato')) {
    const data = FALLBACK_CATALOG['club_de_nuit'];
    const filteredItems = data.items.filter(item => item.estimatedPrice <= maxPrice);
    const chosen = filteredItems.length > 0 ? filteredItems : data.items.slice(0, 3);
    return {
      originalReference: data.original,
      originalEstimatedPrice: data.originalPrice,
      analysis: `Hemos encontrado excelentes alternativas directas con el célebre ADN cítrico y abedul ahumado de Club de Nuit Intense Man, priorizando opciones con precio por debajo de tu límite de $${maxPrice} MXN y salidas más balanceadas.${skinNote}`,
      recommendations: adaptRecommendationsToSkin(chosen, skinProfile),
    };
  }

  // Generic fallback if different perfume requested
  const genericItems: PerfumeItem[] = [
      {
        id: 'lattafa-khamrah',
        name: 'Khamrah',
        brand: 'Lattafa',
        estimatedPrice: 780,
        savingsPercent: 55,
        matchScore: 94,
        olfactoryFamily: 'Ámbar Especiado Gourmand',
        topNotes: ['Canela', 'Nuez moscada', 'Bergamota'],
        heartNotes: ['Dátiles', 'Praliné', 'Nardos', 'Mahonial'],
        baseNotes: ['Vainilla', 'Haba tonka', 'Benjuí', 'Mirra', 'Madera de Akigala'],
        longevityHours: '9 - 12 hrs',
        sillage: 'Potente',
        bestOccasions: ['Noches frías', 'Citas especiales', 'Invierno / Otoño'],
        whyItMatches: 'Aroma dulce, licoroso y envolvente de nivel nicho con una relación calidad-precio excepcional.',
        pros: ['Fijación extrema de más de 10 horas', 'Botella de cristal tallado estilo licorera', 'Calidez sofisticada'],
        badge: 'Gourmand N° 1',
        vibeDescription: 'Cálido, tentador y opulento con notas de canela, dátiles y vainilla tostada.',
        comparison: { opening: 90, drydown: 95, longevity: 96, projection: 93 }
      },
      {
        id: 'zara-vibrant-leather',
        name: 'Vibrant Leather',
        brand: 'Zara',
        estimatedPrice: 520,
        savingsPercent: 65,
        matchScore: 90,
        olfactoryFamily: 'Amaderado Cítrico Cuero',
        topNotes: ['Bergamota brillante'],
        heartNotes: ['Bambú crujiente'],
        baseNotes: ['Cuero flexible'],
        longevityHours: '5 - 6 hrs',
        sillage: 'Moderada',
        bestOccasions: ['Oficina diaria', 'Clima templado', 'Uso versátil'],
        whyItMatches: 'Alternativa limpia y minimalista, perfecta para presupuestos bajos sin renunciar a una salida fresca y moderna.',
        pros: ['Muy económico', 'Aceptación universal', 'Elegante y no invasivo'],
        badge: 'Mejor Opción Diaria',
        vibeDescription: 'Frescura cítrica moderna con un fondo de cuero refinado y limpio.',
        comparison: { opening: 88, drydown: 90, longevity: 76, projection: 78 }
      },
      {
        id: 'afnan-9pm',
        name: '9 PM',
        brand: 'Afnan',
        estimatedPrice: 650,
        savingsPercent: 60,
        matchScore: 95,
        olfactoryFamily: 'Ámbar Vainilla Dulce',
        topNotes: ['Manzana', 'Canela', 'Lavanda silvestre', 'Bergamota'],
        heartNotes: ['Flor de azahar', 'Lirio de los valles'],
        baseNotes: ['Vainilla', 'Haba tonka', 'Ámbar', 'Pachulí'],
        longevityHours: '8 - 10 hrs',
        sillage: 'Intensa',
        bestOccasions: ['Fiestas', 'Salidas nocturnas', 'Jóvenes y citas'],
        whyItMatches: 'Famoso dupe del icónico Ultra Male de JPG, con salida afrutada y vainilla vibrante que dura toda la noche.',
        pros: ['Generador de cumplidos número uno', 'Gran proyección nocturna', 'Excelente relación calidad-precio'],
        badge: 'Rey de la Fiesta',
        vibeDescription: 'Juvenil, seductor y dulce con una estela inconfundible.',
        comparison: { opening: 93, drydown: 96, longevity: 94, projection: 92 }
      }
    ];

  return {
    originalReference: query.length > 3 ? query : 'Fragancia de referencia',
    originalEstimatedPrice: 1750,
    analysis: `Selección curada por IA con alternativas equilibradas de alta fijación dentro de tu rango de presupuesto ($${minPrice} - $${maxPrice} MXN).${skinNote}`,
    recommendations: adaptRecommendationsToSkin(genericItems, skinProfile),
  };
}

function getCuratedVibeResponse(vibe: string, maxPrice: number, skinProfile?: any) {
  const v = vibe.toLowerCase();
  const skinNote = skinProfile?.skinType
    ? ` Adaptado a tu piel ${skinProfile.skinType} (hidratación ${skinProfile.hydration || 'Media'}).`
    : '';

  if (v.includes('bosque') || v.includes('pino') || v.includes('madera') || v.includes('tierra') || v.includes('lluvia') || v.includes('musgo')) {
    const forestItems: PerfumeItem[] = [
      {
        id: 'lalique-encre-noire',
        name: 'Encre Noire',
        brand: 'Lalique',
        estimatedPrice: 680,
        savingsPercent: 60,
        matchScore: 96,
        olfactoryFamily: 'Amaderado Aromático Terroso',
        topNotes: ['Ciprés'],
        heartNotes: ['Vetiver de Haití', 'Vetiver Bourbon'],
        baseNotes: ['Madera de cachemira', 'Almizcle'],
        longevityHours: '7 - 9 hrs',
        sillage: 'Moderada a Fuerte',
        bestOccasions: ['Días lluviosos', 'Otoño / Invierno', 'Paseos al aire libre'],
        whyItMatches: 'Evoca exactamente un bosque húmedo y sombrío tras la lluvia gracias a su dosis maestra de ciprés verde y vetiver terroso.',
        pros: ['Obra maestra de perfumería a precio accesible', 'Aroma realista a madera mojada y musgo', 'Personalidad única'],
        badge: 'Bosque Húmedo Icónico',
        vibeDescription: 'Caminata solitaria entre cipreses altos y tierra húmeda al caer la tarde.'
      },
      {
        id: 'dsquared2-wood',
        name: 'Original Wood',
        brand: 'Dsquared2',
        estimatedPrice: 1120,
        savingsPercent: 35,
        matchScore: 92,
        olfactoryFamily: 'Amaderado Acuático Violeta',
        topNotes: ['Hojas de violeta', 'Cardamomo', 'Nota acuática'],
        heartNotes: ['Abeto blanco', 'Cedro', 'Vetiver'],
        baseNotes: ['Almizcle', 'Pachulí', 'Ámbar'],
        longevityHours: '6 - 8 hrs',
        sillage: 'Moderada',
        bestOccasions: ['Uso diario', 'Primavera / Otoño', 'Oficina creativa'],
        whyItMatches: 'Combina hojas verdes húmedas con madera de abeto y cedro recién cortado, logrando un bosque luminoso y limpio.',
        pros: ['Muy fácil de llevar', 'Sensación de aire puro de montaña', 'Frasco con detalles en madera'],
        badge: 'Bosque Luminoso',
        vibeDescription: 'Aire fresco de montaña, corteza de cedro y hojas verdes con rocío.'
      },
      {
        id: 'zara-bohemian-oud',
        name: 'Bohemian Oud',
        brand: 'Zara',
        estimatedPrice: 520,
        savingsPercent: 55,
        matchScore: 88,
        olfactoryFamily: 'Amaderado Especiado Incienso',
        topNotes: ['Pimienta negra'],
        heartNotes: ['Incienso', 'Cacao', 'Maderas secas'],
        baseNotes: ['Vainilla', 'Cuero', 'Oud suave'],
        longevityHours: '6 - 7 hrs',
        sillage: 'Moderada',
        bestOccasions: ['Noches frescas', 'Otoño', 'Citas acogedoras'],
        whyItMatches: 'Aporta la faceta de cabaña de madera cálida en medio del bosque, con resinas y un toque ahumado envolvente.',
        pros: ['Precio muy bajo', 'Sensación acogedora y maderosa', 'Excelente para clima fresco'],
        badge: 'Cabaña en el Bosque',
        vibeDescription: 'Madera cálida, resinas y brasa suave en una cabaña rodeada de pinos.'
      }
    ];
    const filtered = forestItems.filter((i) => i.estimatedPrice <= maxPrice);
    return {
      vibeQuery: vibe,
      vibeInterpreted: 'Bosque húmedo, pinos y tierra mojada',
      olfactoryPalette: ['Ciprés', 'Vetiver terroso', 'Cedro', 'Abeto blanco', 'Musgo de roble'],
      atmosphereSummary: `Traducimos tu deseo de oler a bosque en notas verdes de ciprés, resinas de pino y maderas húmedas con fondo terroso.${skinNote}`,
      recommendations: adaptRecommendationsToSkin(filtered.length ? filtered : forestItems, skinProfile),
    };
  }

  if (v.includes('limpio') || v.includes('jabón') || v.includes('algodón') || v.includes('ropa') || v.includes('ducha')) {
    const cleanItems: PerfumeItem[] = [
      {
        id: 'prada-lhomme-vibe',
        name: 'White Tea',
        brand: 'Elizabeth Arden',
        estimatedPrice: 640,
        savingsPercent: 50,
        matchScore: 93,
        olfactoryFamily: 'Almizcle Floral Amaderado',
        topNotes: ['Mandarina', 'Salvia', 'Helecho', 'Notas marinas'],
        heartNotes: ['Té blanco', 'Mate', 'Iris blanco'],
        baseNotes: ['Maderas exóticas', 'Almizcle limpio', 'Haba tonka'],
        longevityHours: '5 - 7 hrs',
        sillage: 'Suave / Pulcra',
        bestOccasions: ['Diario', 'Oficina', 'Después de la ducha'],
        whyItMatches: 'Transmite pureza absoluta: sábanas blancas recién lavadas, té tibio y serenidad minimalista.',
        pros: ['Sensación spa inmediata', 'No abruma nunca', 'Muy económico'],
        badge: 'Pulcritud Zen',
        vibeDescription: 'Camisa blanca recién planchada en una mañana tranquila y luminosa.'
      },
      {
        id: 'nautica-voyage-vibe',
        name: 'Pure Musk',
        brand: 'Lattafa',
        estimatedPrice: 550,
        savingsPercent: 60,
        matchScore: 91,
        olfactoryFamily: 'Almizcle Floral Limpio',
        topNotes: ['Almizcle blanco', 'Aldehídos limpios'],
        heartNotes: ['Flores blancas suaves'],
        baseNotes: ['Almizcle cremoso', 'Sándalo suave'],
        longevityHours: '7 - 9 hrs',
        sillage: 'Moderada',
        bestOccasions: ['Todo el año', 'Gimnasio', 'Uso diario'],
        whyItMatches: 'Puro olor a piel limpia, jabón cremoso y algodón suave con sorprendente duración.',
        pros: ['Gran duración para un aroma limpio', 'Unisex total', 'Precio imbatible'],
        badge: 'Algodón & Jabón',
        vibeDescription: 'Burbuja de limpieza, suavidad cremosa y frescura recién salida de la ducha.'
      }
    ];
    return {
      vibeQuery: vibe,
      vibeInterpreted: 'Ropa limpia secada al sol y piel recién duchada',
      olfactoryPalette: ['Almizcle blanco', 'Té blanco', 'Aldehídos limpios', 'Iris', 'Sándalo suave'],
      atmosphereSummary: `Tu vibra se traduce en almizcles blancos aireados, acordes de té y notas jabonosas suaves que proyectan pulcritud.${skinNote}`,
      recommendations: adaptRecommendationsToSkin(cleanItems, skinProfile),
    };
  }

  // Fallback general para cualquier otra vibra
  const generalVibeItems: PerfumeItem[] = [
    {
      id: 'lattafa-khamrah-vibe',
      name: 'Khamrah',
      brand: 'Lattafa',
      estimatedPrice: 780,
      savingsPercent: 55,
      matchScore: 93,
      olfactoryFamily: 'Ámbar Especiado Gourmand',
      topNotes: ['Canela', 'Nuez moscada', 'Bergamota'],
      heartNotes: ['Dátiles', 'Praliné', 'Nardos'],
      baseNotes: ['Vainilla', 'Haba tonka', 'Benjuí', 'Madera de Akigala'],
      longevityHours: '9 - 12 hrs',
      sillage: 'Potente',
      bestOccasions: ['Tardes frescas', 'Cafeterías', 'Noches especiales'],
      whyItMatches: 'Captura atmósferas cálidas, acogedoras y envolventes con especias dulces y maderas ambaradas.',
      pros: ['Estela memorable', 'Calidad de nicho a bajo costo', 'Muy acogedor'],
      badge: 'Atmósfera Cálida',
      vibeDescription: 'Luz ámbar, especias dulces y calidez envolvente de tarde de otoño.'
    },
    {
      id: 'lalique-encre-noire-gen',
      name: 'Encre Noire',
      brand: 'Lalique',
      estimatedPrice: 680,
      savingsPercent: 60,
      matchScore: 90,
      olfactoryFamily: 'Amaderado Aromático',
      topNotes: ['Ciprés'],
      heartNotes: ['Vetiver'],
      baseNotes: ['Cachemira', 'Almizcle'],
      longevityHours: '7 - 9 hrs',
      sillage: 'Moderada',
      bestOccasions: ['Días nublados', 'Lectura', 'Eventos artísticos'],
      whyItMatches: 'Perfecto para vibras introspectivas, naturales, artísticas o melancólicas con carácter amaderado.',
      pros: ['Aroma distintivo', 'Muy accesible', 'Gran personalidad'],
      badge: 'Carácter Artístico',
      vibeDescription: 'Serenidad profunda con maderas oscuras y aire fresco natural.'
    }
  ];

  return {
    vibeQuery: vibe,
    vibeInterpreted: `Interpretación olfativa de "${vibe}"`,
    olfactoryPalette: ['Maderas nobles', 'Ámbar cálido', 'Vetiver', 'Especias suaves', 'Almizcle'],
    atmosphereSummary: `Traducimos tu vibra "${vibe}" en acordes equilibrados dentro de tu presupuesto de hasta $${maxPrice} MXN.${skinNote}`,
    recommendations: adaptRecommendationsToSkin(generalVibeItems, skinProfile),
  };
}

async function startServer() {
  // Always serve public folder for manifest.json, sw.js, and icons
  app.use(express.static(path.resolve(__dirname, 'public')));

  // Mounting Vite middlewares in dev mode, static in prod
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
