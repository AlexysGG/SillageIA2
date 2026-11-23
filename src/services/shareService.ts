import { PerfumeItem } from '../types/perfume';

export interface ShareResult {
  shared: boolean;
  method: 'native' | 'clipboard';
  message: string;
}

export async function sharePerfume(
  perfume: PerfumeItem,
  originalReference?: string
): Promise<ShareResult> {
  const shareTitle = `Aura Dupe: ${perfume.name} (${perfume.brand})`;
  const refText = originalReference ? ` Alternativa a ${originalReference}.` : '';
  const shareText = `¡Mira esta fragancia recomendada por el sumiller de SILLAGE IA! ✨\n${perfume.name} de ${perfume.brand} por solo ~$${Math.round(perfume.estimatedPrice).toLocaleString('es-MX')} MXN (${perfume.matchScore}% afinidad).${refText}\nFamilia: ${perfume.olfactoryFamily}\nDuración: ${perfume.longevityHours}`;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : 'https://aura.app';

  // 1. Try Native Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      });
      return {
        shared: true,
        method: 'native',
        message: 'Compartido correctamente',
      };
    } catch (err: any) {
      // User cancelled share dialog
      if (err.name === 'AbortError') {
        return {
          shared: false,
          method: 'native',
          message: 'Compartir cancelado',
        };
      }
      console.warn('[WebShare] Native share failed, falling back to clipboard:', err);
    }
  }

  // 2. Fallback to Clipboard API
  try {
    const clipboardPayload = `${shareText}\n\nEnlace: ${shareUrl}`;
    await navigator.clipboard.writeText(clipboardPayload);
    return {
      shared: true,
      method: 'clipboard',
      message: '¡Detalles copiados al portapapeles para compartir!',
    };
  } catch (clipErr) {
    console.error('[WebShare] Clipboard fallback failed:', clipErr);
    return {
      shared: false,
      method: 'clipboard',
      message: 'No se pudo compartir la fragancia',
    };
  }
}
