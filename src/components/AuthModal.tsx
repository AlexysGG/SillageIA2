import React, { useState, useEffect } from 'react';
import { AuthUser } from '../types/perfume';
import { X, LogIn, UserPlus, LogOut, User, Heart, Users } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  user: AuthUser | null;
  favoritesCount: number;
  onClose: () => void;
  onAuthChange: (user: AuthUser | null) => void;
  onOpenWishlist: () => void;
  onGoToTwins: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  user,
  favoritesCount,
  onClose,
  onAuthChange,
  onOpenWishlist,
  onGoToTwins,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo completar la autenticación');
      }
      onAuthChange({ id: data.id, username: data.username });
      setUsername('');
      setPassword('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore offline error
    }
    onAuthChange(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-white/80 backdrop-blur-2xl border border-white/75 shadow-2xl shadow-slate-900/15 p-6 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-white/70 transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>

        {user ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{user.username}</h3>
                <p className="text-xs text-emerald-700 font-medium">Sesión activa · SILLAGE IA</p>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToTwins();
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/70 hover:bg-white border border-white/80 text-xs font-semibold text-slate-800 transition-all"
              >
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Mi Perfil & Gemelos de Piel
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWishlist();
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/70 hover:bg-white border border-white/80 text-xs font-semibold text-slate-800 transition-all"
              >
                <span className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" />
                  Mis Favoritos Guardados
                </span>
                {favoritesCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px]">
                    {favoritesCount}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-50/80 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200/70 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cerrar Sesión
            </button>
          </div>
        ) : (
          <div>
            <div className="text-center mb-5">
              <h3 className="text-xl font-serif-luxury text-slate-950">
                {mode === 'login' ? 'Bienvenido a SILLAGE IA' : 'Crea tu cuenta'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Guarda tu perfil de piel y publica reseñas en la nube
              </p>
            </div>

            <div className="flex items-center gap-1.5 mb-5 p-1 bg-slate-200/60 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'login' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'register' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Registrarse
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Usuario
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tu nombre de usuario"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 bg-white/75 text-sm text-slate-900 focus:bg-white focus:border-slate-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 3 caracteres"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 bg-white/75 text-sm text-slate-900 focus:bg-white focus:border-slate-900 focus:outline-hidden"
                />
              </div>

              {error && (
                <div className="text-xs text-rose-700 bg-rose-50/90 border border-rose-200 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-semibold transition-all shadow-md"
              >
                {loading
                  ? 'Procesando...'
                  : mode === 'login'
                  ? 'Entrar a mi cuenta'
                  : 'Crear cuenta'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
