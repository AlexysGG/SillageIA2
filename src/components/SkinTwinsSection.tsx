import React, { useMemo, useState } from 'react';
import { AuthUser, CatalogPerfume, SkinProfile } from '../types/perfume';
import {
  computePrediction,
  generateSkinTwins,
  getLocalHumidity,
  setAppBadge,
  clearAppBadge,
} from '../services/skinTwins';
import { saveSkinProfileDB, queueOfflineAction } from '../services/db';
import { sendLocalNotification } from '../services/pushNotifications';
import {
  UserCheck,
  MapPin,
  Droplets,
  Sparkles,
  Bell,
  LogOut,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShieldCheck,
  Users,
  Lock,
  RefreshCw,
} from 'lucide-react';

interface SkinTwinsSectionProps {
  user: AuthUser | null;
  skinProfile: SkinProfile | null;
  catalog: CatalogPerfume[];
  onAuthChange: (user: AuthUser | null) => void;
  onProfileChange: (profile: SkinProfile | null) => void;
  onRefreshSyncCount: () => Promise<void>;
  onSelectCatalogPerfume: (perfume: CatalogPerfume) => void;
  onOpenAuth?: (mode: 'login' | 'register') => void;
}

const SKIN_TYPES = ['Grasa', 'Seca', 'Mixta', 'Normal', 'Sensible'];
const HYDRATION_LEVELS = ['Alta', 'Media', 'Baja'];
const CLIMATES = ['Cálido y húmedo', 'Cálido y seco', 'Templado', 'Frío'];

export const SkinTwinsSection: React.FC<SkinTwinsSectionProps> = ({
  user,
  skinProfile,
  catalog,
  onAuthChange,
  onProfileChange,
  onRefreshSyncCount,
  onSelectCatalogPerfume,
  onOpenAuth,
}) => {
  // Auth state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Profile form state
  const [skinType, setSkinType] = useState(skinProfile?.skinType || 'Mixta');
  const [hydration, setHydration] = useState(skinProfile?.hydration || 'Media');
  const [climate, setClimate] = useState(skinProfile?.climate || 'Templado');
  const [humidity, setHumidity] = useState(skinProfile?.humidity || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [expandedTwin, setExpandedTwin] = useState<number | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  // Sync form inputs when skinProfile loads
  React.useEffect(() => {
    if (skinProfile) {
      setSkinType(skinProfile.skinType || 'Mixta');
      setHydration(skinProfile.hydration || 'Media');
      setClimate(skinProfile.climate || 'Templado');
      setHumidity(skinProfile.humidity || '');
    }
  }, [skinProfile]);

  const topPredictions = useMemo(() => {
    if (!skinProfile || catalog.length === 0) return [];
    return catalog
      .map((p) => computePrediction(p, skinProfile))
      .sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))
      .slice(0, 3);
  }, [skinProfile, catalog]);

  const twins = useMemo(() => {
    if (!skinProfile || catalog.length === 0) return [];
    return generateSkinTwins(skinProfile, catalog, user?.id);
  }, [skinProfile, catalog, user?.id]);

  const twinsStats = useMemo(() => {
    if (twins.length === 0) return { avg: 0, totalReviews: 0 };
    const avg = Math.round(twins.reduce((s, t) => s + t.match, 0) / twins.length);
    const totalReviews = twins.reduce((s, t) => s + t.reviewCount, 0);
    return { avg, totalReviews };
  }, [twins]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo completar la autenticación');
      }
      const authedUser: AuthUser = { id: data.id, username: data.username };
      onAuthChange(authedUser);
      setUsername('');
      setPassword('');
    } catch (err: any) {
      setAuthError(err.message || 'Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore offline logout error
    }
    onAuthChange(null);
    onProfileChange(null);
    clearAppBadge();
  };

  const handleDetectHumidity = async () => {
    setDetectingGps(true);
    const hum = await getLocalHumidity();
    setHumidity(hum);
    setDetectingGps(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setStatusMessage(null);

    const resolvedHumidity = humidity || (await getLocalHumidity());
    setHumidity(resolvedHumidity);

    const newProfile: SkinProfile = {
      userId: user.id,
      skinType,
      hydration,
      climate,
      humidity: resolvedHumidity,
      updatedAt: new Date().toISOString(),
    };

    // Always persist in IndexedDB for offline PWA support
    await saveSkinProfileDB(String(user.id), newProfile);
    onProfileChange(newProfile);
    setAppBadge(catalog.length || 16);

    if (navigator.onLine) {
      try {
        const res = await fetch('/api/user/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skin_type: skinType,
            hydration,
            climate,
            humidity: resolvedHumidity,
          }),
        });
        if (res.ok) {
          setStatusMessage('Perfil cutáneo guardado y sincronizado.');
        } else {
          setStatusMessage('Perfil guardado localmente en tu dispositivo.');
        }
      } catch {
        await queueOfflineAction('save_profile', newProfile);
        await onRefreshSyncCount();
        setStatusMessage('Guardado offline. Se sincronizará automáticamente al volver la señal.');
      }
    } else {
      await queueOfflineAction('save_profile', newProfile);
      await onRefreshSyncCount();
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
          .then((reg: any) => reg.sync?.register('sync-profile'))
          .catch(() => {});
      }
      setStatusMessage('Modo offline: perfil guardado en IndexedDB y encolado para Background Sync.');
    }

    setSavingProfile(false);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleEnableAlerts = async () => {
    const ok = await sendLocalNotification('Gemelos de Piel · Aura', {
      body: `Alertas de fijación activadas para tu piel ${skinType} en clima ${climate}.`,
      data: { url: '/?action=twins' },
    });
    if (ok) {
      setAlertsEnabled(true);
      setStatusMessage('Alertas de fijación activadas.');
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage('Permiso de notificaciones denegado o no soportado.');
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-zinc-200/80 shadow-2xs text-[11px] font-medium text-zinc-600 mb-3 tracking-wide uppercase">
          <Users className="w-3 h-3 text-emerald-600" />
          <span>Sistema de Gemelos de Piel · Match Biológico</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-normal tracking-tight text-zinc-950 font-serif-luxury">
          Tu Perfil Cutáneo & Gemelos de Piel
        </h2>
        <p className="mt-2 text-sm text-zinc-500 max-w-xl mx-auto">
          Registra tu tipo de piel, hidratación y clima (con humedad GPS) para predecir la fijación real de cada perfume y encontrar personas con química idéntica a la tuya.
        </p>
      </div>

      {/* Not logged in -> Clear Registration Gate */}
      {!user ? (
        <div className="max-w-lg mx-auto rounded-3xl bg-white/65 backdrop-blur-xl border border-white/80 shadow-xl shadow-slate-900/5 p-7 sm:p-9 text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
            <Lock className="w-6 h-6 text-emerald-300" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-serif-luxury text-slate-950">
              Necesitas registrarte para acceder
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Para configurar tu perfil de piel y descubrir tus <strong>Gemelos de Piel</strong>, primero debes crear una cuenta o iniciar sesión desde el botón superior.
            </p>
          </div>
          {onOpenAuth && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-sm"
              >
                Registrarme ahora
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-white/80 hover:bg-white text-slate-800 border border-slate-200/80 text-xs font-semibold transition-all"
              >
                Ya tengo cuenta · Iniciar sesión
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Logged-in User Bar */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-900 text-white flex items-center justify-center font-serif-luxury text-sm font-bold">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-zinc-950">{user.username}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="w-3 h-3" /> Sesión Activa
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  {skinProfile
                    ? `Piel ${skinProfile.skinType} · Hidratación ${skinProfile.hydration} · Clima ${skinProfile.climate}`
                    : 'Aún no has configurado tu perfil cutáneo'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleEnableAlerts}
                disabled={alertsEnabled}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  alertsEnabled
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>{alertsEnabled ? 'Alertas activadas' : 'Activar alertas de fijación'}</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salir</span>
              </button>
            </div>
          </div>

          {statusMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-medium flex items-center gap-2">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Main 2-column Grid: Form + Predictions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Skin Profile Form */}
            <form
              onSubmit={handleSaveProfile}
              className="lg:col-span-5 bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4 shadow-sm"
            >
              <h3 className="text-lg font-bold font-serif-luxury text-zinc-950 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-amber-500" />
                <span>Configurar Perfil Cutáneo</span>
              </h3>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                  Tipo de piel
                </label>
                <select
                  value={skinType}
                  onChange={(e) => setSkinType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 text-sm text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-hidden"
                >
                  {SKIN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                  Nivel de hidratación
                </label>
                <select
                  value={hydration}
                  onChange={(e) => setHydration(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 text-sm text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-hidden"
                >
                  {HYDRATION_LEVELS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                  Clima habitual
                </label>
                <select
                  value={climate}
                  onChange={(e) => setClimate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 text-sm text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-hidden"
                >
                  {CLIMATES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200/70 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-zinc-700">
                  <MapPin className="w-4 h-4 text-zinc-500 shrink-0" />
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
                      Humedad exterior (GPS)
                    </span>
                    <span className="font-semibold">{humidity || 'Sin detectar'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDetectHumidity}
                  disabled={detectingGps}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${detectingGps ? 'animate-spin' : ''}`} />
                  <span>{detectingGps ? 'GPS...' : 'Detectar'}</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-all active:scale-[0.99] disabled:opacity-60"
              >
                {savingProfile ? 'Guardando...' : 'Guardar Perfil y Calcular Match'}
              </button>
            </form>

            {/* Biological Match Predictions */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold font-serif-luxury text-zinc-950 flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Top 3 Predicciones de Fijación (Match Biológico)</span>
                </h3>
                <p className="text-xs text-zinc-500 mb-4">
                  Estimación personalizada según tu tipo de piel e hidratación.
                </p>

                {!skinProfile ? (
                  <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl p-8 text-center text-xs text-zinc-500">
                    Guarda tu perfil cutáneo para desbloquear tus predicciones personalizadas de fijación.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Guía de Atomizaciones y Zonas */}
                    {(() => {
                      const skinLower = (skinProfile.skinType || '').toLowerCase();
                      const hydLower = (skinProfile.hydration || '').toLowerCase();
                      const climLower = (skinProfile.climate || '').toLowerCase();
                      const isOily = skinLower.includes('grasa');
                      const isDry = skinLower.includes('seca') || hydLower.includes('baja');
                      const isSensitive = skinLower.includes('sensible');
                      const isHot = climLower.includes('cálido');

                      const sprays = isOily && isHot ? '2 – 3 atomizaciones' : isDry ? '5 – 6 atomizaciones' : '3 – 4 atomizaciones';
                      const zones = isSensitive
                        ? ['Sobre ropa (hombros/cuello)', 'Nuca (cabello)', 'Muñeca (prueba previa)']
                        : isDry
                        ? ['Cuello hidratado (2)', 'Clavícula / pecho (1)', 'Ropa o suéter (2)']
                        : isOily
                        ? ['Detrás de cada oreja (2)', 'Nuca (1)', 'Evitar pecho en calor']
                        : ['Detrás de orejas (2)', 'Muñecas sin frotar (1)', 'Cuello o ropa (1)'];
                      const tip = isDry
                        ? 'Aplica crema neutra sin aroma antes de atomizar para evitar evaporación rápida.'
                        : isOily
                        ? 'Tu piel retiene bien las notas de fondo; modera los sprays en días calurosos.'
                        : isSensitive
                        ? 'Prioriza aplicar sobre tela o a 20 cm para evitar irritación en piel.'
                        : 'Atomiza a 15–20 cm sin frotar las muñecas para no romper la salida.';

                      return (
                        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                              <Droplets className="w-3.5 h-3.5 text-emerald-600" />
                              Guía de Atomizaciones y Zonas
                            </span>
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white">
                              {sprays}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {zones.map((z) => (
                              <span
                                key={z}
                                className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white/90 text-emerald-900 border border-emerald-200/70"
                              >
                                {z}
                              </span>
                            ))}
                          </div>
                          <p className="text-[11px] text-emerald-800 leading-relaxed">{tip}</p>
                        </div>
                      );
                    })()}
                    {topPredictions.map((pred) => {
                      const fullPerfume = catalog.find((c) => c.id === pred.id);
                      return (
                        <div
                          key={pred.id}
                          onClick={() => fullPerfume && onSelectCatalogPerfume(fullPerfume)}
                          className="p-4 rounded-xl bg-zinc-50/80 hover:bg-zinc-100/70 border border-zinc-200/70 transition-colors cursor-pointer space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-sm text-zinc-950">
                                {pred.name}
                              </span>
                              <span className="text-xs text-zinc-500 ml-2">{pred.brand}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-full">
                                {pred.rating}★
                              </span>
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                {pred.match}% match
                              </span>
                            </div>
                          </div>

                          <div className="text-xs text-zinc-600">
                            Fijación estimada en tu piel: <strong>{pred.duration}</strong>
                          </div>

                          {pred.alertaTwins && (
                            <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50/90 px-2.5 py-1.5 rounded-lg border border-amber-200/60">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                              <span>{pred.alertaTwins}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Skin Twins Grid */}
          {skinProfile && twins.length > 0 && (
            <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold font-serif-luxury text-zinc-950">
                    Tus Gemelos de Piel
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    <strong className="text-zinc-900">{twins.length} gemelos</strong> encontrados ·{' '}
                    <strong className="text-zinc-900">{twinsStats.avg}%</strong> de coincidencia
                    media · <strong className="text-zinc-900">{twinsStats.totalReviews}</strong>{' '}
                    reseñas filtradas para ti
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 font-medium">
                    Piel {skinProfile.skinType}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 font-medium">
                    Hidratación {skinProfile.hydration}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 font-medium">
                    {skinProfile.climate}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 font-medium">
                    Humedad {skinProfile.humidity || 'local'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {twins.map((twin, idx) => {
                  const isOpen = expandedTwin === idx;
                  return (
                    <article
                      key={idx}
                      className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {twin.match}%
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-zinc-950">{twin.name}</div>
                            <div className="text-[11px] text-zinc-500">
                              {twin.skin} · {twin.hydration} · {twin.climate}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedTwin(isOpen ? null : idx)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-zinc-200 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                          <span>{isOpen ? 'Ocultar' : 'Ver reseña'}</span>
                          {isOpen ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        <span className="px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-600 font-medium">
                          {twin.reviewCount} reseñas filtradas
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-500">
                          activo hace {twin.months} meses
                        </span>
                      </div>

                      {isOpen && (
                        <div className="pt-2 border-t border-zinc-200/70 text-xs text-zinc-700 space-y-1.5">
                          <p className="italic text-zinc-600">“{twin.quote}”</p>
                          {twin.perfume && (
                            <p className="text-[11px] text-zinc-800">
                              <strong>Concuerdan en:</strong> {twin.perfume.name} —{' '}
                              {twin.perfume.brand}
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
