import { createHash } from 'crypto';

/**
 * Huella del texto exacto de una versión del aviso (aviso breve + política).
 * Es lo que queda en cada constancia de consentimiento. La migración
 * PrivacyNotices usa la misma fórmula para la versión inicial.
 */
export function computeNoticeHash(summary: string, policy: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ summary, policy }))
    .digest('hex');
}

/** Unifica saltos de línea y recorta: el mismo texto da siempre la misma huella. */
export function normalizeNoticeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}
