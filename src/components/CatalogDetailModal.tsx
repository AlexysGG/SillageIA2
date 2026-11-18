import React, { useEffect, useMemo, useState } from 'react';
import { AuthUser, CatalogPerfume, SkinProfile } from '../types/perfume';
import {
  computePrediction,
  generatePerfumeReviews,
  PerfumeReview,
  shareCatalogPerfume,
} from '../services/skinTwins';
import {
  X,
  Star,
  Droplets,
  AlertTriangle,
  Sparkles,
  Share2,
  ExternalLink,
  Users,
  Globe,
  Clock,
  MessageSquare,
} from 'lucide-react';

interface CatalogDetailModalProps {
  perfume: CatalogPerfume | null;
  skinProfile: SkinProfile | null;
  authUser: AuthUser | null;
  onClose: () => void;
  onFindDupes: (perfume: CatalogPerfume) => void;
  onPerfumeUpdated?: (updated: CatalogPerfume) => void;
}

export const CatalogDetailModal: React.FC<CatalogDetailModalProps> = ({
  perfume,
  skinProfile,
  authUser,
  onClose,
  onFindDupes,
  onPerfumeUpdated,
}) => {
  const [mode, setMode] = useState<'global' | 'twins'>(skinProfile ? 'twins' : 'global');
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [userReviews, setUserReviews] = useState<PerfumeReview[]>([]);
  const [newReviewText, setNewReviewText] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewTarget, setNewReviewTarget] = useState<'global' | 'twins' | 'both'>(
    skinProfile ? 'twins' : 'global'
  );
  const [newReviewDuration, setNewReviewDuration] = useState('7-9 horas');
  const [newReviewSillage, setNewReviewSillage] = useState('Moderada');
  const [newReviewOccasion, setNewReviewOccasion] = useState('Uso diario');

  useEffect(() => {
    if (!perfume) return;
    setMode(skinProfile ? 'twins' : 'global');
    setNewReviewTarget(skinProfile ? 'twins' : 'global');

    const loadReviews = async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch(`/api/perfumes/${perfume.id}/reviews`);
          if (res.ok) {
            const serverList = await res.json();
            const mapped: PerfumeReview[] = serverList.map((r: any) => ({
              id: r.id,
              author: r.author || 'Usuario',
              skinType: r.skinType || 'General',
              hydration: r.hydration || 'Media',
              climate: r.climate || 'Templado',
              rating: Number(r.rating) || 5,
              duration: r.duration || '6-8 horas',
              sillage: r.sillage,
              occasion: r.occasion,
              target: r.target || 'both',
              comment: r.comment,
              date: r.createdAt
                ? new Date(r.createdAt).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                  })
                : 'Reciente',
              twinMatch:
                skinProfile && r.skinType === skinProfile.skinType ? 98 : undefined,
            }));
            setUserReviews(mapped);
            try {
              localStorage.setItem(`aura_perfume_reviews_${perfume.id}`, JSON.stringify(mapped));
            } catch {}
            return;
          }
        } catch {
          // Fallback to localStorage
        }
      }
      try {
        const saved = localStorage.getItem(`aura_perfume_reviews_${perfume.id}`);
        setUserReviews(saved ? JSON.parse(saved) : []);
      } catch {
        setUserReviews([]);
      }
    };

    loadReviews();
  }, [perfume?.id, skinProfile]);

  const generatedReviews = useMemo(() => {
    if (!perfume) return [];
    return generatePerfumeReviews(perfume, mode, skinProfile);
  }, [perfume, mode, skinProfile]);

  const displayedReviews = useMemo(() => {
    const filteredCustom = userReviews.filter((r) => {
      const t = r.target || 'both';
      if (mode === 'global') {
        return t === 'global' || t === 'both';
      }
      // mode === 'twins'
      const matchesTarget = t === 'twins' || t === 'both';
      const matchesSkin = !skinProfile || r.skinType === skinProfile.skinType;
      return matchesTarget && matchesSkin;
    });
    return [...filteredCustom, ...generatedReviews];
  }, [userReviews, generatedReviews, mode, skinProfile]);

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perfume || !newReviewText.trim()) return;

    const payload = {
      author: authUser?.username || 'Invitado',
      skinType: skinProfile?.skinType || 'General',
      hydration: skinProfile?.hydration || 'Media',
      climate: skinProfile?.climate || 'Templado',
      rating: newReviewRating,
      duration: newReviewDuration,
      sillage: newReviewSillage,
      occasion: newReviewOccasion,
      target: newReviewTarget,
      comment: newReviewText.trim(),
    };

    let savedReview: PerfumeReview = {
      id: `user-${Date.now()}`,
      ...payload,
      date: 'Ahora mismo',
      twinMatch: skinProfile && newReviewTarget !== 'global' ? 100 : undefined,
    };

    if (navigator.onLine) {
      try {
        const res = await fetch(`/api/perfumes/${perfume.id}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.review) {
            savedReview = {
              ...savedReview,
              id: data.review.id,
              author: data.review.author,
            };
          }
          if (data.perfume && onPerfumeUpdated) {
            onPerfumeUpdated(data.perfume);
          }
        }
      } catch {
        // Fallback to local save
      }
    }

    const updated = [savedReview, ...userReviews];
    setUserReviews(updated);
    try {
      localStorage.setItem(`aura_perfume_reviews_${perfume.id}`, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
    setNewReviewText('');
  };

  if (!perfume) return null;

  const prediction = skinProfile ? computePrediction(perfume, skinProfile) : null;
  const twinReviews = Math.max(3, Math.round((perfume.reviews || 0) * 0.07));
  const activeAlert =
    mode === 'twins'
      ? prediction?.alertaTwins || perfume.alertaTwins || perfume.alertaGlobal || 'Comportamiento equilibrado en tu tipo de piel.'
      : perfume.alertaGlobal || perfume.alertaTwins;

  const activeDuration =
    mode === 'twins' && prediction
      ? `${prediction.duration} (${prediction.match}% match biológico para tu perfil)`
      : mode === 'twins'
      ? perfume.durationTwins
      : perfume.durationGlobal;

  const activeRating =
    mode === 'twins' && prediction
      ? prediction.rating
      : mode === 'twins'
      ? Math.min(4.9, perfume.rating + 0.1).toFixed(1)
      : perfume.rating.toFixed(1);

  const handleShare = async () => {
    const res = await shareCatalogPerfume(perfume);
    if (res.shared) {
      setShareFeedback(res.message);
      setTimeout(() => setShareFeedback(null), 2500);
    }
  };

  const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(`${perfume.name} ${perfume.brand} perfume`)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl border border-zinc-200 shadow-2xl p-6 sm:p-8 space-y-6 text-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors"
          title="Cerrar detalle"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500 bg-zinc-100 px-3 py-0.5 rounded-full">
              {perfume.brand}
            </span>
            <span className="text-xs font-medium text-zinc-600 bg-zinc-50 px-2.5 py-0.5 rounded-full border border-zinc-200 capitalize">
              {perfume.category}
            </span>
            <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              {perfume.concentration} · {perfume.volume}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold font-serif-luxury text-zinc-950">
            {perfume.name}
          </h2>
          <p className="text-sm text-zinc-500 mt-1 leading-relaxed">{perfume.description}</p>
        </div>

        {/* Switch en Vivo: Consenso Global vs. Gemelos de Piel */}
        <div className="bg-zinc-50 rounded-2xl p-4 sm:p-5 border border-zinc-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
                Switch en Vivo de Fijación
              </span>
              <span className="text-xs text-zinc-600">
                {skinProfile
                  ? `Tu piel: ${skinProfile.skinType} · Hidratación ${skinProfile.hydration}`
                  : 'Compara el consenso general frente a gemelos de piel'}
              </span>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-zinc-200/70 border border-zinc-200">
              <button
                type="button"
                onClick={() => setMode('global')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'global'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Consenso Global</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('twins')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'twins'
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Gemelos de Piel</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-200/70">
            <div className="bg-white rounded-xl p-3 border border-zinc-200/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Calificación
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                <span className="text-lg font-bold text-zinc-950">{activeRating}</span>
                <span className="text-xs text-zinc-400">
                  ({mode === 'twins' ? twinReviews : perfume.reviews} reseñas)
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 border border-zinc-200/60 sm:col-span-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Duración en piel
              </span>
              <p className="text-xs font-medium text-zinc-800 mt-1.5 leading-relaxed">
                {activeDuration}
              </p>
            </div>
          </div>
        </div>

        {/* Alerta de Notas / Oxidación */}
        {activeAlert && (
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
                Alerta de Notas & Oxidación ({mode === 'twins' ? 'Gemelos de Piel' : 'Global'})
              </span>
              <p className="text-xs text-amber-900 mt-0.5 leading-relaxed">{activeAlert}</p>
            </div>
          </div>
        )}

        {/* Pirámide Olfativa */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
            <Droplets className="w-4 h-4 text-zinc-500" />
            Pirámide Olfativa
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/70">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1">
                Salida
              </div>
              <p className="text-xs text-zinc-700 font-medium leading-relaxed">{perfume.notes.top}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/70">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700 mb-1">
                Corazón
              </div>
              <p className="text-xs text-zinc-700 font-medium leading-relaxed">
                {perfume.notes.heart}
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/70">
              <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 mb-1">
                Fondo
              </div>
              <p className="text-xs text-zinc-700 font-medium leading-relaxed">
                {perfume.notes.base}
              </p>
            </div>
          </div>
        </div>

        {/* Ficha Técnica */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-zinc-50/70 p-4 rounded-2xl border border-zinc-100">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
              Perfumista
            </span>
            <span className="font-semibold text-zinc-800">{perfume.perfumer}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">Año</span>
            <span className="font-semibold text-zinc-800">{perfume.year}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
              Precio ref.
            </span>
            <span className="font-semibold text-zinc-800">${perfume.price.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
              Volumen
            </span>
            <span className="font-semibold text-zinc-800">{perfume.volume}</span>
          </div>
        </div>

        {/* Reseñas (Consenso Global vs. Gemelos de Piel) */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-zinc-500" />
              <span>
                {mode === 'twins'
                  ? `Reseñas de Gemelos de Piel (${skinProfile ? `Piel ${skinProfile.skinType}` : 'Filtradas'})`
                  : 'Reseñas del Consenso Global'}
              </span>
            </h4>
            <span className="text-[11px] text-zinc-400 font-medium">
              {mode === 'twins' ? `${twinReviews} filtradas` : `${perfume.reviews} totales`}
            </span>
          </div>

          <div className="space-y-2.5">
            {displayedReviews.map((rev) => (
              <div
                key={rev.id}
                className="p-3.5 rounded-2xl bg-zinc-50/80 border border-zinc-200/70 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-900">{rev.author}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-600 font-medium">
                      Piel {rev.skinType} · {rev.hydration}
                    </span>
                    {rev.twinMatch && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                        {rev.twinMatch}% gemelo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                      {rev.rating.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-zinc-400">{rev.date}</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-700 leading-relaxed">{rev.comment}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-400">
                  <span>
                    Fijación reportada: <strong className="text-zinc-600">{rev.duration}</strong>
                  </span>
                  {rev.sillage && (
                    <span>
                      · Estela: <strong className="text-zinc-600">{rev.sillage}</strong>
                    </span>
                  )}
                  {rev.occasion && (
                    <span>
                      · Ocasión: <strong className="text-zinc-600">{rev.occasion}</strong>
                    </span>
                  )}
                  <span>· Clima {rev.climate}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Agregar reseña propia */}
          <form
            onSubmit={handleAddReview}
            className="bg-zinc-50/70 border border-zinc-200/80 rounded-2xl p-3.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Publicar mi reseña
              </span>
              <div className="flex items-center gap-1 bg-zinc-200/70 p-0.5 rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setNewReviewTarget('global')}
                  className={`px-2 py-1 rounded-md font-medium transition-all ${
                    newReviewTarget === 'global'
                      ? 'bg-white text-zinc-900 shadow-2xs'
                      : 'text-zinc-600'
                  }`}
                >
                  Consenso Global
                </button>
                <button
                  type="button"
                  onClick={() => setNewReviewTarget('twins')}
                  className={`px-2 py-1 rounded-md font-medium transition-all ${
                    newReviewTarget === 'twins'
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'text-zinc-600'
                  }`}
                >
                  Gemelos de Piel
                </button>
                <button
                  type="button"
                  onClick={() => setNewReviewTarget('both')}
                  className={`px-2 py-1 rounded-md font-medium transition-all ${
                    newReviewTarget === 'both'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-zinc-600'
                  }`}
                >
                  Ambos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select
                value={newReviewRating}
                onChange={(e) => setNewReviewRating(Number(e.target.value))}
                title="Calificación"
                className="px-2.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-800 focus:outline-hidden"
              >
                <option value={5}>5 ★ Excelente</option>
                <option value={4}>4 ★ Muy bueno</option>
                <option value={3}>3 ★ Normal</option>
                <option value={2}>2 ★ Flojo</option>
                <option value={1}>1 ★ Malo</option>
              </select>

              <select
                value={newReviewDuration}
                onChange={(e) => setNewReviewDuration(e.target.value)}
                title="Horas de fijación"
                className="px-2.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-800 focus:outline-hidden"
              >
                <option value="Menos de 3 horas">&lt; 3 horas</option>
                <option value="3-5 horas">3-5 horas</option>
                <option value="5-7 horas">5-7 horas</option>
                <option value="7-9 horas">7-9 horas</option>
                <option value="9-12 horas">9-12 horas</option>
                <option value="+12 horas">+12 horas</option>
              </select>

              <select
                value={newReviewSillage}
                onChange={(e) => setNewReviewSillage(e.target.value)}
                title="Estela / Proyección"
                className="px-2.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-800 focus:outline-hidden"
              >
                <option value="Íntima">Estela: Íntima</option>
                <option value="Moderada">Estela: Moderada</option>
                <option value="Fuerte">Estela: Fuerte</option>
                <option value="Modo Bestia">Estela: Modo Bestia</option>
              </select>

              <select
                value={newReviewOccasion}
                onChange={(e) => setNewReviewOccasion(e.target.value)}
                title="Ocasión de uso"
                className="px-2.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-800 focus:outline-hidden"
              >
                <option value="Uso diario">Uso diario</option>
                <option value="Oficina">Oficina</option>
                <option value="Noche / Fiesta">Noche / Fiesta</option>
                <option value="Clima cálido">Clima cálido</option>
                <option value="Clima frío">Clima frío</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newReviewText}
                onChange={(e) => setNewReviewText(e.target.value)}
                placeholder={`Escribe tu experiencia con ${perfume.name} en tu piel...`}
                className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-hidden"
              />
              <button
                type="submit"
                disabled={!newReviewText.trim()}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-colors disabled:opacity-40"
              >
                Publicar reseña
              </button>
            </div>
          </form>
        </div>

        {/* Actions */}
        {shareFeedback && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-center font-medium">
            {shareFeedback}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onFindDupes(perfume);
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-all active:scale-[0.99]"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Buscar Dupes Económicos con IA</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>Compartir</span>
          </button>

          <a
            href={amazonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Amazon</span>
          </a>
        </div>
      </div>
    </div>
  );
};
