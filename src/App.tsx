/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { SearchHero } from './components/SearchHero';
import { ResultsSection } from './components/ResultsSection';
import { PerfumeDetailModal } from './components/PerfumeDetailModal';
import { CatalogSection } from './components/CatalogSection';
import { CatalogDetailModal } from './components/CatalogDetailModal';
import { SkinTwinsSection } from './components/SkinTwinsSection';
import { VibeTranslatorSection } from './components/VibeTranslatorSection';
import { AuthModal } from './components/AuthModal';
import { WishlistDrawer } from './components/WishlistDrawer';
import { OfflineBanner } from './components/OfflineBanner';
import { InstallModal } from './components/InstallModal';
import { NotificationModal } from './components/NotificationModal';
import {
  RecommendationResponse,
  PerfumeItem,
  CatalogPerfume,
  AuthUser,
  SkinProfile,
} from './types/perfume';
import { CATALOG_PERFUMES } from './data/catalogPerfumes';
import { usePWAInstall } from './hooks/usePWAInstall';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import {
  cacheQueryResult,
  getCachedQueryResult,
  saveFavoriteDB,
  removeFavoriteDB,
  getFavoritesDB,
  queueOfflineAction,
  getSkinProfileDB,
  saveSkinProfileDB,
} from './services/db';
import { setAppBadge } from './services/skinTwins';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendLocalNotification,
} from './services/pushNotifications';
import { Info, RefreshCw, Feather, WifiOff, Bell, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');
  const [query, setQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState(800);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [results, setResults] = useState<RecommendationResponse | null>(null);
  const [selectedPerfume, setSelectedPerfume] = useState<PerfumeItem | null>(null);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [inAppNotification, setInAppNotification] = useState<{
    title: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ title: string; body: string }>).detail;
      if (detail) {
        setInAppNotification(detail);
        setTimeout(() => {
          setInAppNotification((prev) => (prev?.title === detail.title ? null : prev));
        }, 6000);
      }
    };
    window.addEventListener('aura:notification', handler);
    return () => window.removeEventListener('aura:notification', handler);
  }, []);

  // SillageAI: Catalog, Auth & Skin Profile
  const [catalog, setCatalog] = useState<CatalogPerfume[]>(CATALOG_PERFUMES);
  const [selectedCatalogPerfume, setSelectedCatalogPerfume] = useState<CatalogPerfume | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('aura_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [skinProfile, setSkinProfile] = useState<SkinProfile | null>(() => {
    try {
      const saved = localStorage.getItem('aura_skin_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // PWA Hooks
  const { isInstallable, isInstalled, isStandalone, isIOS, triggerInstall } = usePWAInstall();

  // Network & Sync Hook
  const { isOnline, wasOffline, pendingSyncCount, refreshPendingCount, processPendingSync } =
    useNetworkStatus((syncedCount) => {
      setOfflineNotice(`¡Sincronización completada! (${syncedCount} acción${syncedCount > 1 ? 'es' : ''} actualizada${syncedCount > 1 ? 's' : ''})`);
      setTimeout(() => setOfflineNotice(null), 3000);
    });

  // Favorites state backed by both IndexedDB and LocalStorage fallback
  const [favorites, setFavorites] = useState<PerfumeItem[]>(() => {
    try {
      const saved = localStorage.getItem('aura_perfume_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Initial favorites, catalog & auth/profile sync
  useEffect(() => {
    getFavoritesDB().then((dbFavorites) => {
      if (dbFavorites && dbFavorites.length > 0) {
        setFavorites(dbFavorites);
      }
    });

    if (navigator.onLine) {
      fetch('/api/perfumes')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setCatalog(data);
          }
        })
        .catch(() => {});

      fetch('/api/auth/me')
        .then((r) => (r.ok ? r.json() : null))
        .then((me) => {
          if (me && me.id) {
            setAuthUser(me);
            localStorage.setItem('aura_auth_user', JSON.stringify(me));
          }
        })
        .catch(() => {});
    }
  }, []);

  // Load skin profile when authUser changes
  useEffect(() => {
    if (!authUser) {
      localStorage.removeItem('aura_auth_user');
      localStorage.removeItem('aura_skin_profile');
      return;
    }
    localStorage.setItem('aura_auth_user', JSON.stringify(authUser));

    const loadProfile = async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch('/api/user/profile');
          if (res.ok) {
            const p = await res.json();
            const mapped: SkinProfile = {
              id: p.id,
              userId: p.user_id,
              skinType: p.skin_type,
              hydration: p.hydration,
              climate: p.climate,
              humidity: p.humidity || 'No disponible',
              updatedAt: p.updated_at,
            };
            setSkinProfile(mapped);
            localStorage.setItem('aura_skin_profile', JSON.stringify(mapped));
            await saveSkinProfileDB(String(authUser.id), mapped);
            setAppBadge(catalog.length || 16);
            return;
          }
        } catch {
          // Fallback to IndexedDB
        }
      }
      const local = await getSkinProfileDB(String(authUser.id));
      if (local) {
        setSkinProfile(local);
        localStorage.setItem('aura_skin_profile', JSON.stringify(local));
        setAppBadge(catalog.length || 16);
      }
    };

    loadProfile();
  }, [authUser, catalog.length]);

  const handleToggleFavorite = async (item: PerfumeItem) => {
    const exists = favorites.some((p) => p.id === item.id);
    let updated: PerfumeItem[];

    if (exists) {
      updated = favorites.filter((p) => p.id !== item.id);
      await removeFavoriteDB(item.id);
    } else {
      updated = [...favorites, item];
      await saveFavoriteDB(item);
    }

    setFavorites(updated);
    try {
      localStorage.setItem('aura_perfume_favorites', JSON.stringify(updated));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }

    if (!navigator.onLine) {
      await queueOfflineAction('toggle_favorite', { item, action: exists ? 'remove' : 'add' });
      await refreshPendingCount();
    }
  };

  const getSkinKey = (profile: SkinProfile | null) =>
    profile ? `${profile.skinType}_${profile.hydration}_${profile.climate}` : 'guest';

  const handleConsultar = useCallback(
    async (searchQuery = query, budget = maxPrice, profileOverride?: SkinProfile | null) => {
      if (!searchQuery.trim()) return;
      const activeProfile = profileOverride !== undefined ? profileOverride : skinProfile;
      const skinKey = getSkinKey(activeProfile);
      setIsLoading(true);
      setError(null);
      setOfflineNotice(null);

      // Check IndexedDB cache first (keyed by query + budget + skin profile)
      const cached = await getCachedQueryResult(searchQuery, budget, skinKey);

      if (!navigator.onLine) {
        // In offline mode: use cached if available
        if (cached) {
          setResults(cached);
          setOfflineNotice('Mostrando resultados cacheados en tu dispositivo (Modo Offline).');
          setIsLoading(false);
          return;
        }

        // If not cached, queue query for background sync
        await queueOfflineAction('search_query', { query: searchQuery, maxPrice: budget });
        await refreshPendingCount();
      }

      try {
        const res = await fetch('/api/recommend-perfumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            maxPrice: budget,
            minPrice: 0,
            skinProfile: activeProfile || undefined,
          }),
        });

        if (!res.ok) {
          throw new Error('Error al conectar con el sumiller inteligente.');
        }

        const data: RecommendationResponse = await res.json();
        setResults(data);

        // Store in IndexedDB for instant offline retrieval
        await cacheQueryResult(searchQuery, budget, data, skinKey);

        // Notify user when AI finishes the query
        if (getNotificationPermission() === 'granted') {
          const topPick = data.recommendations?.[0];
          const body = topPick
            ? `Encontramos ${data.recommendations.length} alternativas para "${data.originalReference}". Destacada: ${topPick.name} (${topPick.brand}) ~$${Math.round(topPick.estimatedPrice).toLocaleString('es-MX')} MXN.`
            : `Tu consulta sobre "${data.originalReference}" está lista.`;
          sendLocalNotification('SILLAGE IA · Recomendación lista', {
            body,
            data: { url: '/?action=search' },
          });
        }

        // Scroll to results gently
        setTimeout(() => {
          const el = document.getElementById('results-section');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      } catch (err: any) {
        console.error('Fetch error:', err);

        // If fetch fails but we had cached data in IndexedDB, fallback to it
        if (cached) {
          setResults(cached);
          setOfflineNotice('Conexión inestable. Se muestran los últimos datos cacheados en tu dispositivo.');
        } else {
          setError(
            !navigator.onLine
              ? 'Sin conexión a internet. La consulta se ha encolado para sincronizarse automáticamente cuando recuperes la señal.'
              : err.message || 'No pudimos obtener la recomendación. Inténtalo de nuevo.'
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [query, maxPrice, skinProfile, refreshPendingCount]
  );

  // App Shortcuts & Web Share Target Handling (from URL ?action=... or ?q=.../?text=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const sharedQ = params.get('q') || params.get('text') || params.get('title');

    if (sharedQ && sharedQ.trim()) {
      const q = sharedQ.trim();
      setActiveTab('search');
      setQuery(q);
      handleConsultar(q, 50);
      return;
    }

    if (action === 'wishlist') {
      setIsWishlistOpen(true);
    } else if (action === 'catalog') {
      setActiveTab('catalog');
    } else if (action === 'twins') {
      setActiveTab('twins');
    } else if (action === 'club_de_nuit') {
      const q = 'quiero un perfume similar de Club de nuit mas barato';
      setActiveTab('search');
      setQuery(q);
      setMaxPrice(800);
      handleConsultar(q, 800);
    } else if (action === 'sommelier') {
      const q = 'asesoramiento del sumiller olfativo para fragancias versátiles y económicas';
      setActiveTab('search');
      setQuery(q);
      setMaxPrice(950);
      handleConsultar(q, 950);
    }
  }, []);

  const handleFindDupesFromCatalog = (perfume: CatalogPerfume) => {
    const q = `quiero un dupe económico similar a ${perfume.name} de ${perfume.brand}`;
    const budget = Math.min(2800, Math.max(600, Math.round(perfume.price * 0.45)));
    setActiveTab('search');
    setQuery(q);
    setMaxPrice(budget);
    handleConsultar(q, budget);
  };

  return (
    <div className="relative min-h-screen flex flex-col text-slate-900 selection:bg-slate-900 selection:text-white overflow-x-hidden">
      {/* Ambient Glassmorphism Backdrop Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/35 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[28rem] h-[28rem] rounded-full bg-emerald-200/30 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 w-96 h-96 rounded-full bg-sky-200/35 blur-3xl" />
      </div>

      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        favoritesCount={favorites.length}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenAuth={() => {
          setAuthModalMode('login');
          setIsAuthModalOpen(true);
        }}
        onReset={() => {
          setQuery('');
          setMaxPrice(800);
          setResults(null);
          setError(null);
        }}
        onOpenInstall={() => setIsInstallModalOpen(true)}
        onOpenNotifications={() => setIsNotificationModalOpen(true)}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isStandalone={isStandalone}
        username={authUser?.username}
      />

      {/* Offline Status & Background Sync Alert Banner */}
      <OfflineBanner
        isOnline={isOnline}
        wasOffline={wasOffline}
        pendingSyncCount={pendingSyncCount}
        onManualSync={processPendingSync}
      />

      <main className="flex-1">
        {/* Offline Notice Badge */}
        {offlineNotice && (
          <div className="max-w-4xl mx-auto px-4 mt-4">
            <div className="bg-amber-50 border border-amber-200/80 text-amber-900 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{offlineNotice}</span>
              </div>
              <button
                onClick={() => setOfflineNotice(null)}
                className="font-bold underline ml-2 text-amber-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {activeTab === 'search' && (
          <>
            {/* Hero & Input Section */}
            <SearchHero
              query={query}
              setQuery={setQuery}
              maxPrice={maxPrice}
              setMaxPrice={setMaxPrice}
              onSearch={async () => {
                if (getNotificationPermission() === 'default') {
                  await requestNotificationPermission();
                }
                handleConsultar(query, maxPrice);
              }}
              isLoading={isLoading}
            />

            {/* Error message */}
            {error && (
              <div className="max-w-2xl mx-auto px-4 my-4">
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                  <button
                    onClick={() => handleConsultar(query, maxPrice)}
                    className="font-bold underline hover:no-underline ml-3 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {/* Results Section */}
            {results && (
              <ResultsSection
                data={results}
                currentMaxPrice={maxPrice}
                onAdjustMaxPrice={(newMax) => {
                  setMaxPrice(newMax);
                  handleConsultar(query, newMax);
                }}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onSelectPerfume={(perfume) => setSelectedPerfume(perfume)}
              />
            )}
          </>
        )}

        {activeTab === 'vibes' && (
          <VibeTranslatorSection
            skinProfile={skinProfile}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onSelectPerfume={(perfume) => setSelectedPerfume(perfume)}
          />
        )}

        {activeTab === 'catalog' && (
          <CatalogSection
            perfumes={catalog}
            skinProfile={skinProfile}
            onSelectPerfume={(p) => setSelectedCatalogPerfume(p)}
            onFindDupes={handleFindDupesFromCatalog}
          />
        )}

        {activeTab === 'twins' && (
          <SkinTwinsSection
            user={authUser}
            skinProfile={skinProfile}
            catalog={catalog}
            onAuthChange={(u) => setAuthUser(u)}
            onProfileChange={(p) => {
              setSkinProfile(p);
              if (p) {
                localStorage.setItem('aura_skin_profile', JSON.stringify(p));
              } else {
                localStorage.removeItem('aura_skin_profile');
              }
              if (results && navigator.onLine) {
                handleConsultar(query, maxPrice, p);
              }
            }}
            onRefreshSyncCount={refreshPendingCount}
            onSelectCatalogPerfume={(p) => setSelectedCatalogPerfume(p)}
            onOpenAuth={(mode) => {
              setAuthModalMode(mode);
              setIsAuthModalOpen(true);
            }}
          />
        )}
      </main>

      {/* Catalog Fragrance Detail Modal (Switch Global vs Gemelos de Piel) */}
      <CatalogDetailModal
        perfume={selectedCatalogPerfume}
        skinProfile={skinProfile}
        authUser={authUser}
        onClose={() => setSelectedCatalogPerfume(null)}
        onFindDupes={handleFindDupesFromCatalog}
        onPerfumeUpdated={(updatedPerfume) => {
          setSelectedCatalogPerfume(updatedPerfume);
          setCatalog((prev) =>
            prev.map((item) => (item.id === updatedPerfume.id ? updatedPerfume : item))
          );
        }}
      />

      {/* Fragrance Details Modal with Web Share API */}
      <PerfumeDetailModal
        perfume={selectedPerfume}
        originalReference={results?.originalReference}
        originalPrice={results?.originalEstimatedPrice}
        onClose={() => setSelectedPerfume(null)}
        isFavorite={selectedPerfume ? favorites.some((f) => f.id === selectedPerfume.id) : false}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* Wishlist Drawer */}
      <WishlistDrawer
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        favorites={favorites}
        onRemoveFavorite={async (id) => {
          const item = favorites.find((f) => f.id === id);
          if (item) {
            await handleToggleFavorite(item);
          }
        }}
        onClearAll={async () => {
          for (const item of favorites) {
            await removeFavoriteDB(item.id);
          }
          setFavorites([]);
          localStorage.removeItem('aura_perfume_favorites');
        }}
        onSelectPerfume={(item) => {
          setSelectedPerfume(item);
          setIsWishlistOpen(false);
        }}
      />

      {/* PWA Install Modal */}
      <InstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        onInstall={triggerInstall}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isIOS={isIOS}
      />

      {/* Web Push & Native Notification Modal */}
      <NotificationModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
      />

      {/* In-App Floating Notification Toast (always visible on PC) */}
      {inAppNotification && (
        <div className="fixed top-20 right-4 z-50 max-w-sm w-[calc(100%-2rem)] bg-zinc-950 text-white rounded-2xl border border-zinc-800 shadow-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-8 h-8 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white">{inAppNotification.title}</div>
            {inAppNotification.body && (
              <p className="text-[11px] text-zinc-300 mt-0.5 leading-relaxed">
                {inAppNotification.body}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setInAppNotification(null)}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            aria-label="Cerrar notificación"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Auth Modal (Login / Register / Account) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        user={authUser}
        favoritesCount={favorites.length}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthChange={(u) => {
          setAuthUser(u);
          if (!u) {
            setSkinProfile(null);
            localStorage.removeItem('aura_skin_profile');
          }
        }}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onGoToTwins={() => setActiveTab('twins')}
      />

      {/* Clean Minimalist Glass Footer */}
      <footer className="border-t border-white/70 bg-white/55 backdrop-blur-xl py-8 mt-16 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 tracking-wider">SILLAGE IA</span>
            <span>• Atelier Olfativo con IA y Persistencia en la Nube</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>Precios orientativos en Pesos Mexicanos (MXN)</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Feather className="w-3 h-3" />
              Diseño Glassmorphism PWA
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
