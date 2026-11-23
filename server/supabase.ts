/**
 * Adaptador ligero de Supabase vía REST (PostgREST) sin dependencias nativas extra.
 * Si SUPABASE_URL y SUPABASE_ANON_KEY (o SUPABASE_SERVICE_ROLE_KEY) están configuradas,
 * las reseñas nuevas se guardan y leen desde Supabase. Si no, el servidor usa data/store.json.
 */

export interface SupabaseReviewRecord {
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

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    '';
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}

function mapRowToReview(row: any): SupabaseReviewRecord {
  return {
    id: String(row.id),
    perfumeId: Number(row.perfume_id),
    userId: row.user_id !== null && row.user_id !== undefined ? Number(row.user_id) || null : null,
    author: String(row.author || 'Usuario'),
    skinType: String(row.skin_type || 'General'),
    hydration: String(row.hydration || 'Media'),
    climate: String(row.climate || 'Templado'),
    rating: Number(row.rating) || 5,
    duration: String(row.duration || '6-8 horas'),
    sillage: row.sillage ? String(row.sillage) : 'Moderada',
    occasion: row.occasion ? String(row.occasion) : 'Uso diario',
    target:
      row.target === 'global' || row.target === 'twins' || row.target === 'both'
        ? row.target
        : 'both',
    comment: String(row.comment || ''),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function fetchSupabaseReviews(perfumeId?: number): Promise<SupabaseReviewRecord[] | null> {
  if (!isSupabaseConfigured()) return null;
  const { url, key } = getSupabaseConfig();

  try {
    const filter = perfumeId !== undefined ? `&perfume_id=eq.${perfumeId}` : '';
    const endpoint = `${url}/rest/v1/reviews?select=*${filter}&order=created_at.desc`;
    const res = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!res.ok) {
      console.warn('[Supabase] fetchSupabaseReviews status:', res.status);
      return null;
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    return rows.map(mapRowToReview);
  } catch (err) {
    console.warn('[Supabase] Error reading reviews:', err);
    return null;
  }
}

export async function insertSupabaseReview(
  review: SupabaseReviewRecord
): Promise<SupabaseReviewRecord | null> {
  if (!isSupabaseConfigured()) return null;
  const { url, key } = getSupabaseConfig();

  try {
    const payload = {
      id: review.id,
      perfume_id: review.perfumeId,
      user_id: review.userId !== null && review.userId !== undefined ? String(review.userId) : null,
      author: review.author,
      skin_type: review.skinType,
      hydration: review.hydration,
      climate: review.climate,
      rating: review.rating,
      duration: review.duration,
      sillage: review.sillage || 'Moderada',
      occasion: review.occasion || 'Uso diario',
      target: review.target,
      comment: review.comment,
      created_at: review.createdAt,
    };

    const res = await fetch(`${url}/rest/v1/reviews`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[Supabase] insertSupabaseReview failed:', res.status, errText);
      return null;
    }

    const inserted = await res.json();
    if (Array.isArray(inserted) && inserted[0]) {
      return mapRowToReview(inserted[0]);
    }
    return review;
  } catch (err) {
    console.warn('[Supabase] Error inserting review:', err);
    return null;
  }
}

export interface SupabaseUserRecord {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface SupabaseSkinProfileRecord {
  id: number;
  user_id: number;
  skin_type: string;
  hydration: string;
  climate: string;
  humidity: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchSupabaseUserByUsername(
  username: string
): Promise<SupabaseUserRecord | null> {
  if (!isSupabaseConfigured()) return null;
  const { url, key } = getSupabaseConfig();

  try {
    const endpoint = `${url}/rest/v1/app_users?username=ilike.${encodeURIComponent(
      username.trim()
    )}&select=*&limit=1`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows[0]) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      username: String(row.username),
      passwordHash: String(row.password_hash),
      createdAt: String(row.created_at),
    };
  } catch {
    return null;
  }
}

export async function insertSupabaseUser(
  username: string,
  passwordHash: string
): Promise<SupabaseUserRecord | null> {
  if (!isSupabaseConfigured()) return null;
  const { url, key } = getSupabaseConfig();

  try {
    const res = await fetch(`${url}/rest/v1/app_users`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        username: username.trim(),
        password_hash: passwordHash,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[Supabase] insertSupabaseUser failed:', res.status, errText);
      return null;
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows[0]) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      username: String(row.username),
      passwordHash: String(row.password_hash),
      createdAt: String(row.created_at),
    };
  } catch {
    return null;
  }
}

export async function fetchSupabaseProfile(
  userId: number
): Promise<SupabaseSkinProfileRecord | null> {
  if (!isSupabaseConfigured()) return null;
  const { url, key } = getSupabaseConfig();

  try {
    const endpoint = `${url}/rest/v1/skin_profiles?user_id=eq.${encodeURIComponent(
      String(userId)
    )}&select=*&limit=1`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows[0]) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      user_id: Number(row.user_id),
      skin_type: String(row.skin_type),
      hydration: String(row.hydration),
      climate: String(row.climate),
      humidity: row.humidity ? String(row.humidity) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  } catch {
    return null;
  }
}

export async function upsertSupabaseProfile(
  userId: number,
  data: { skin_type: string; hydration: string; climate: string; humidity?: string | null }
): Promise<SupabaseSkinProfileRecord | null> {
  if (!isSupabaseConfigured()) return null;
  const { url, key } = getSupabaseConfig();

  try {
    const now = new Date().toISOString();
    const res = await fetch(`${url}/rest/v1/skin_profiles?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: String(userId),
        skin_type: data.skin_type,
        hydration: data.hydration,
        climate: data.climate,
        humidity: data.humidity || null,
        updated_at: now,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[Supabase] upsertSupabaseProfile failed:', res.status, errText);
      return null;
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows[0]) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      user_id: Number(row.user_id),
      skin_type: String(row.skin_type),
      hydration: String(row.hydration),
      climate: String(row.climate),
      humidity: row.humidity ? String(row.humidity) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  } catch {
    return null;
  }
}
