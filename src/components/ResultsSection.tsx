import React, { useState, useMemo } from 'react';
import { RecommendationResponse, PerfumeItem } from '../types/perfume';
import { PerfumeCard } from './PerfumeCard';
import { Sparkles, ArrowUpDown, Tag, CheckCircle2, SlidersHorizontal, AlertCircle } from 'lucide-react';

interface ResultsSectionProps {
  data: RecommendationResponse;
  currentMaxPrice: number;
  onAdjustMaxPrice: (newPrice: number) => void;
  favorites: PerfumeItem[];
  onToggleFavorite: (item: PerfumeItem) => void;
  onSelectPerfume: (item: PerfumeItem) => void;
}

type SortOption = 'affinity' | 'price-asc' | 'longevity';

export const ResultsSection: React.FC<ResultsSectionProps> = ({
  data,
  currentMaxPrice,
  onAdjustMaxPrice,
  favorites,
  onToggleFavorite,
  onSelectPerfume,
}) => {
  const [sortBy, setSortBy] = useState<SortOption>('affinity');
  const [bottlesPerYear, setBottlesPerYear] = useState<number>(2);

  // Filter recommendations based on current budget slider
  const filteredItems = useMemo(() => {
    return data.recommendations.filter((item) => item.estimatedPrice <= currentMaxPrice);
  }, [data.recommendations, currentMaxPrice]);

  // Sort items according to active sort option
  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    if (sortBy === 'affinity') {
      return list.sort((a, b) => b.matchScore - a.matchScore);
    }
    if (sortBy === 'price-asc') {
      return list.sort((a, b) => a.estimatedPrice - b.estimatedPrice);
    }
    if (sortBy === 'longevity') {
      return list.sort((a, b) => {
        const getHours = (h: string) => parseInt(h.split('-')[0] || '6', 10);
        return getHours(b.longevityHours) - getHours(a.longevityHours);
      });
    }
    return list;
  }, [filteredItems, sortBy]);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  return (
    <section id="results-section" className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Sommelier Insight Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-7 shadow-xs mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Veredicto del Sumiller
              </span>
              <span className="text-zinc-300">•</span>
              <span className="text-xs text-zinc-500">
                Referencia: <strong className="text-zinc-900 font-semibold">{data.originalReference}</strong>
              </span>
            </div>
            <p className="text-sm sm:text-base text-zinc-700 leading-relaxed max-w-3xl font-normal">
              {data.analysis}
            </p>
          </div>

          {/* Calculadora de Ahorro en MXN */}
          {data.originalEstimatedPrice > 0 && (() => {
            const bestOption = sortedItems[0] || data.recommendations[0];
            const dupePrice = bestOption ? bestOption.estimatedPrice : data.originalEstimatedPrice * 0.45;
            const unitSavings = Math.max(0, Math.round(data.originalEstimatedPrice - dupePrice));
            const annualSavings = unitSavings * bottlesPerYear;
            return (
              <div className="shrink-0 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl px-4 py-3 space-y-2 min-w-[260px]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 block font-medium">
                      Original Ref.
                    </span>
                    <span className="text-sm font-bold text-zinc-700 line-through decoration-zinc-400">
                      ~${Math.round(data.originalEstimatedPrice).toLocaleString('es-MX')} MXN
                    </span>
                  </div>
                  <div className="h-7 w-px bg-emerald-200/80" />
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-emerald-800 block font-semibold">
                      Ahorro por frasco
                    </span>
                    <span className="text-base font-bold text-emerald-700">
                      ${unitSavings.toLocaleString('es-MX')} MXN
                    </span>
                  </div>
                </div>
                <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-emerald-900 font-medium">
                    Frascos/año:
                    <select
                      value={bottlesPerYear}
                      onChange={(e) => setBottlesPerYear(Number(e.target.value))}
                      className="ml-1.5 bg-white border border-emerald-200 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-emerald-900"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                    </select>
                  </span>
                  <span className="font-bold text-emerald-800">
                    Ahorro anual: ${annualSavings.toLocaleString('es-MX')} MXN
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Results Controls Bar */}
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>Resultados:</span>
            <strong className="text-zinc-900 font-semibold">
              {sortedItems.length} {sortedItems.length === 1 ? 'fragancia' : 'fragancias'}
            </strong>
            <span>dentro de tu presupuesto (≤ ${currentMaxPrice.toLocaleString('es-MX')} MXN)</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" />
              Ordenar por:
            </span>
            <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50 text-xs">
              <button
                onClick={() => setSortBy('affinity')}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  sortBy === 'affinity'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Mayor afinidad
              </button>
              <button
                onClick={() => setSortBy('price-asc')}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  sortBy === 'price-asc'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Más barato
              </button>
              <button
                onClick={() => setSortBy('longevity')}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  sortBy === 'longevity'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Fijación
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fragrance Cards Grid */}
      {sortedItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedItems.map((perfume) => (
            <PerfumeCard
              key={perfume.id}
              perfume={perfume}
              originalReference={data.originalReference}
              isFavorite={favoriteIds.has(perfume.id)}
              onToggleFavorite={onToggleFavorite}
              onSelect={onSelectPerfume}
            />
          ))}
        </div>
      ) : (
        /* Empty State if slider is too strict */
        <div className="text-center py-12 px-6 bg-white rounded-2xl border border-zinc-200">
          <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 font-serif-luxury">
            Ninguna alternativa por debajo de ${currentMaxPrice.toLocaleString('es-MX')} MXN
          </h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto mt-1 mb-4 font-normal">
            Las alternativas de alta fijación para esta consulta suelen empezar desde $450 - $550 MXN. Puedes ampliar el presupuesto para ver los resultados.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => onAdjustMaxPrice(800)}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
            >
              Ajustar a $800 MXN
            </button>
            <button
              onClick={() => onAdjustMaxPrice(1400)}
              className="px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 rounded-xl text-xs font-semibold transition-all"
            >
              Ajustar a $1,400 MXN
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
