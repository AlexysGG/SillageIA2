import React, { useState, useMemo } from 'react';
import {
  PerfumeItem,
  SkinProfile,
  VibeTranslationResponse,
} from '../types/perfume';
import { PerfumeCard } from './PerfumeCard';
import {
  Wand2,
  Trees,
  Sparkles,
  ArrowRight,
  RotateCcw,
  SlidersHorizontal,
  Info,
  Wind,
} from 'lucide-react';

interface VibeTranslatorSectionProps {
  skinProfile: SkinProfile | null;
  favorites: PerfumeItem[];
  onToggleFavorite: (item: PerfumeItem) => void;
  onSelectPerfume: (item: PerfumeItem) => void;
}

const VIBE_PRESETS = [
  'Quiero oler a bosque húmedo después de la lluvia',
  'Librería antigua con café caliente y madera',
  'Ropa limpia secada al sol de primavera',
  'Noche misteriosa de cuero, humo y jazz',
  'Brisa marina en una costa mediterránea',
];

const VIBE_BUDGETS = [
  { label: 'Hasta $800 MXN', value: 800 },
  { label: 'Hasta $1,400 MXN', value: 1400 },
  { label: 'Hasta $2,200 MXN', value: 2200 },
  { label: 'Hasta $4,000 MXN', value: 4000 },
];

export const VibeTranslatorSection: React.FC<VibeTranslatorSectionProps> = ({
  skinProfile,
  favorites,
  onToggleFavorite,
  onSelectPerfume,
}) => {
  const [vibe, setVibe] = useState('');
  const [maxPrice, setMaxPrice] = useState(1400);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VibeTranslationResponse | null>(null);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  const handleTranslate = async (vibeText = vibe, budget = maxPrice) => {
    const trimmed = vibeText.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/translate-vibe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vibe: trimmed,
          maxPrice: budget,
          skinProfile,
        }),
      });

      if (!res.ok) {
        throw new Error('No se pudo traducir la vibra en este momento.');
      }

      const data: VibeTranslationResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con el Traductor de Vibes.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleTranslate();
  };

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-14">
      {/* Header */}
      <div className="max-w-3xl mx-auto text-center mb-8 sm:mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-semibold text-emerald-800 mb-4 tracking-wide uppercase">
          <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Traductor de Vibes con Gemini AI</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-normal tracking-tight text-zinc-950 font-serif-luxury leading-tight">
          Describe una sensación, lugar o vibra
        </h1>
        <p className="mt-3 text-sm sm:text-base text-zinc-500 max-w-xl mx-auto leading-relaxed">
          ¿Quieres oler a bosque húmedo, a ropa limpia o a tarde de lluvia? Nuestra IA traduce tu vibra en notas olfativas y te recomienda perfumes reales.
        </p>
      </div>

      {/* Input Card */}
      <div className="max-w-3xl mx-auto bg-white/65 backdrop-blur-xl rounded-2xl border border-white/80 shadow-xl shadow-slate-900/5 p-4 sm:p-7 mb-10">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="vibe-input"
                className="text-xs font-semibold uppercase tracking-wider text-zinc-600 flex items-center gap-1.5"
              >
                <Trees className="w-3.5 h-3.5 text-emerald-600" />
                <span>¿A qué quieres oler hoy?</span>
              </label>
              {vibe && (
                <button
                  type="button"
                  onClick={() => setVibe('')}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>

            <textarea
              id="vibe-input"
              rows={2}
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder='Ej: "Quiero oler a bosque de pinos después de la lluvia..."'
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/60 focus:bg-white focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-all resize-none"
            />
          </div>

          {/* Preset Vibes */}
          <div>
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block mb-2">
              Ideas rápidas de vibes
            </span>
            <div className="flex flex-wrap gap-2">
              {VIBE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setVibe(preset);
                    handleTranslate(preset, maxPrice);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 transition-colors text-left"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Budget + Submit */}
          <div className="pt-2 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-500 flex items-center gap-1 mr-1">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Presupuesto:
              </span>
              {VIBE_BUDGETS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setMaxPrice(b.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    maxPrice === b.value
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={isLoading || !vibe.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-xs font-semibold transition-all shadow-sm active:scale-95 shrink-0"
            >
              {isLoading ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-spin text-amber-300" />
                  <span>Traduciendo vibra...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Traducir Vibe</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-3xl mx-auto mb-8 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs">
          <Info className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Translated Atmosphere Card */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-7 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">
              <Wind className="w-3.5 h-3.5" />
              <span>Vibra Traducida</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-serif-luxury text-zinc-950 mb-2">
              {result.vibeInterpreted}
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed max-w-3xl mb-4">
              {result.atmosphereSummary}
            </p>

            {/* Olfactory Palette */}
            {result.olfactoryPalette?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mr-1">
                  Paleta olfativa:
                </span>
                {result.olfactoryPalette.map((note) => (
                  <span
                    key={note}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/70"
                  >
                    {note}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Recommendations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {result.recommendations.map((perfume) => (
              <PerfumeCard
                key={perfume.id}
                perfume={perfume}
                isFavorite={favoriteIds.has(perfume.id)}
                onToggleFavorite={() => onToggleFavorite(perfume)}
                onSelect={() => onSelectPerfume(perfume)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
