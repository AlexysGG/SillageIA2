import React from 'react';
import { Sparkles, Heart, Download, Bell, BookOpen, Users, Wand2, LogIn, User } from 'lucide-react';

export type ActiveTab = 'search' | 'vibes' | 'catalog' | 'twins';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  favoritesCount: number;
  onOpenWishlist: () => void;
  onOpenAuth: () => void;
  onReset: () => void;
  onOpenInstall: () => void;
  onOpenNotifications: () => void;
  isInstallable: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  username?: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  favoritesCount,
  onOpenWishlist,
  onOpenAuth,
  onReset,
  onOpenInstall,
  onOpenNotifications,
  isInstallable,
  isInstalled,
  isStandalone,
  username,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/35 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/30 border-b border-white/50 shadow-sm transition-all">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <button
          onClick={() => {
            onTabChange('search');
            onReset();
          }}
          className="flex items-center gap-3 group text-left transition-transform active:scale-95 shrink-0"
        >
          <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-sm group-hover:bg-slate-800 transition-colors">
            <Sparkles className="w-4 h-4 text-slate-100" />
          </div>
          <span className="font-semibold tracking-wider text-sm uppercase text-slate-900">
            SILLAGE IA
          </span>
        </button>

        {/* Center Navigation Tabs (Desktop) */}
        <nav className="hidden md:flex items-center gap-1 p-1 rounded-full bg-zinc-100/90 border border-zinc-200/70">
          <button
            type="button"
            onClick={() => onTabChange('search')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeTab === 'search'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Sumiller AI</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('vibes')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeTab === 'vibes'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Traductor de Vibes</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('catalog')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeTab === 'catalog'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Catálogo</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('twins')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeTab === 'twins'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            <span>{username ? `Piel (${username})` : 'Gemelos de Piel'}</span>
          </button>
        </nav>

        {/* Right tools */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">

          {/* Native Notifications Button */}
          <button
            onClick={onOpenNotifications}
            className="p-2 rounded-full text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200/70 transition-all shadow-2xs"
            title="Configurar notificaciones de dupes"
          >
            <Bell className="w-3.5 h-3.5" />
          </button>

          {/* PWA Install Button */}
          {!isStandalone && (
            <button
              onClick={onOpenInstall}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 shadow-2xs ${
                isInstallable
                  ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200'
              }`}
              title="Instalar Aura como aplicación nativa"
            >
              <Download className={`w-3.5 h-3.5 ${isInstallable ? 'text-amber-300 animate-bounce' : 'text-zinc-500'}`} />
              <span className="hidden sm:inline">
                {isInstalled ? 'App Lista' : 'Instalar App'}
              </span>
            </button>
          )}

          {/* Compact Wishlist Icon */}
          <button
            onClick={onOpenWishlist}
            className="relative p-2 rounded-full text-slate-600 hover:text-slate-900 bg-white/60 hover:bg-white border border-white/80 transition-all shadow-2xs"
            title="Ver favoritos guardados"
          >
            <Heart className={`w-3.5 h-3.5 ${favoritesCount > 0 ? 'fill-rose-500 text-rose-500' : 'text-slate-600'}`} />
            {favoritesCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-slate-900 text-white text-[9px] font-bold px-1 rounded-full min-w-4 text-center leading-tight">
                {favoritesCount}
              </span>
            )}
          </button>

          {/* Login / Account Button (in place of Favoritos pill) */}
          <button
            onClick={onOpenAuth}
            className="relative flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95 shadow-sm"
            title={username ? 'Gestionar cuenta' : 'Iniciar sesión o registrarse'}
          >
            {username ? (
              <>
                <User className="w-3.5 h-3.5 text-emerald-300" />
                <span className="max-w-24 truncate">{username}</span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5 text-slate-200" />
                <span>Iniciar sesión</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <div className="md:hidden border-t border-zinc-100 bg-white/95 px-4 py-2 flex items-center justify-around gap-1">
        <button
          type="button"
          onClick={() => onTabChange('search')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
            activeTab === 'search' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Sumiller</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('vibes')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
            activeTab === 'vibes' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Vibes</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('catalog')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
            activeTab === 'catalog' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Catálogo</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('twins')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
            activeTab === 'twins' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Gemelos</span>
        </button>
      </div>
    </header>
  );
};
