import React, { useMemo, useState } from 'react';
import { CatalogPerfume, SkinProfile } from '../types/perfume';
import { computePrediction } from '../services/skinTwins';
import { Search, Star, Sparkles, Droplets, ArrowUpRight, Filter, Users } from 'lucide-react';

interface CatalogSectionProps {
  perfumes: CatalogPerfume[];
  skinProfile: SkinProfile | null;
  onSelectPerfume: (perfume: CatalogPerfume) => void;
  onFindDupes: (perfume: CatalogPerfume) => void;
}

const CATEGORY_OPTIONS: Array<{ id: 'all' | 'hombre' | 'mujer' | 'unisex'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'hombre', label: 'Hombre' },
  { id: 'mujer', label: 'Mujer' },
  { id: 'unisex', label: 'Unisex' },
];

const CONCENTRATION_OPTIONS = ['all', 'Eau de Parfum', 'Eau de Toilette'];

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  hombre: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  mujer: 'bg-rose-50 text-rose-700 border-rose-200/70',
  unisex: 'bg-amber-50 text-amber-800 border-amber-200/70',
};

export const CatalogSection: React.FC<CatalogSectionProps> = ({
  perfumes,
  skinProfile,
  onSelectPerfume,
  onFindDupes,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'hombre' | 'mujer' | 'unisex'>('all');
  const [concFilter, setConcFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return perfumes.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        `${p.notes.top} ${p.notes.heart} ${p.notes.base}`.toLowerCase().includes(q);
      const matchesCat = categoryFilter === 'all' || p.category === categoryFilter;
      const matchesConc = concFilter === 'all' || p.concentration === concFilter;
      return matchesSearch && matchesCat && matchesConc;
    });
  }, [perfumes, searchQuery, categoryFilter, concFilter]);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-zinc-200/80 shadow-2xs text-[11px] font-medium text-zinc-600 mb-3 tracking-wide uppercase">
          <Droplets className="w-3 h-3 text-amber-500" />
          <span>Enciclopedia Olfativa · Gemelos de Piel</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-normal tracking-tight text-zinc-950 font-serif-luxury">
          Catálogo de Fragancias
        </h2>
        <p className="mt-2 text-sm text-zinc-500 max-w-xl mx-auto">
          Explora notas, consenso global vs. gemelos de piel y encuentra alternativas económicas con nuestra IA.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-sm p-4 sm:p-5 mb-8 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, marca o nota olfativa (ej. vainilla, bergamota, Creed)..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 focus:outline-hidden transition-all"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Category pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Género:
            </span>
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCategoryFilter(opt.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  categoryFilter === opt.id
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Concentration pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {CONCENTRATION_OPTIONS.map((conc) => (
              <button
                key={conc}
                type="button"
                onClick={() => setConcFilter(conc)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  concFilter === conc
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {conc === 'all' ? 'Todas las concentraciones' : conc}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-4 text-xs text-zinc-500">
        <span>
          Mostrando <strong className="text-zinc-900">{filtered.length}</strong> fragancia
          {filtered.length !== 1 ? 's' : ''} de {perfumes.length}
        </span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center text-zinc-500 text-sm">
          No se encontraron fragancias con esos filtros. Intenta con otra búsqueda.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((p) => {
            const skinPred = skinProfile ? computePrediction(p, skinProfile) : null;
            return (
            <article
              key={p.id}
              onClick={() => onSelectPerfume(p)}
              className="group bg-white rounded-2xl border border-zinc-200/90 hover:border-zinc-300 p-5 transition-all duration-300 hover:shadow-xl hover:shadow-zinc-200/40 flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 bg-zinc-100 px-2.5 py-0.5 rounded-full border border-zinc-200/60">
                    {p.brand}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                      CATEGORY_BADGE_STYLES[p.category] || CATEGORY_BADGE_STYLES.unisex
                    }`}
                  >
                    {p.category}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-zinc-950 font-serif-luxury group-hover:text-zinc-700 transition-colors">
                  {p.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {p.concentration} · {p.volume} · {p.year}
                </p>

                {skinPred && skinProfile && (
                  <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full">
                    <Users className="w-3 h-3 text-emerald-600" />
                    <span>
                      Piel {skinProfile.skinType}: {skinPred.match}% match · {skinPred.duration}
                    </span>
                  </div>
                )}

                <p className="text-xs text-zinc-600 mt-3 line-clamp-2 leading-relaxed">
                  {p.description}
                </p>

                <div className="mt-4 bg-zinc-50/80 rounded-xl p-3 border border-zinc-100 space-y-1 text-[11px]">
                  <div className="truncate text-zinc-600">
                    <span className="font-semibold text-zinc-400 uppercase mr-1.5">Salida:</span>
                    {p.notes.top}
                  </div>
                  <div className="truncate text-zinc-600">
                    <span className="font-semibold text-zinc-400 uppercase mr-1.5">Fondo:</span>
                    {p.notes.base}
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-zinc-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-zinc-950">${p.price.toLocaleString('es-MX')} MXN</span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 bg-amber-50 border border-amber-200/60 px-2.5 py-0.5 rounded-full">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                    {skinPred ? skinPred.rating : p.rating.toFixed(1)}
                    <span className="text-zinc-400 font-normal">({p.reviews})</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPerfume(p);
                    }}
                    className="flex items-center justify-center gap-1 py-2 px-3 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 transition-colors"
                  >
                    <span>Ver detalle</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFindDupes(p);
                    }}
                    className="flex items-center justify-center gap-1 py-2 px-3 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Dupes AI</span>
                  </button>
                </div>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
