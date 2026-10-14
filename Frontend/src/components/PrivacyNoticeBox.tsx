import { Link } from 'react-router-dom';
import type { PrivacyNotice } from '@/interfaces';
import { PublicRoutes } from '@/models';

/**
 * Aviso breve de privacidad: lo que se hace con los datos que la persona
 * está por cargar o por confirmar. Siempre con el link a la política
 * completa (se abre en otra pestaña para no perder la reserva).
 */
export function PrivacyNoticeBox({ notice }: { notice: PrivacyNotice }) {
  return (
    <div className="rounded-(--radius-panel) border border-line bg-sheet px-4 py-3.5 text-[0.95rem] leading-relaxed text-ink-soft">
      <p className="whitespace-pre-line">{notice.summary}</p>
      <p className="mt-2">
        <Link
          to={`/${PublicRoutes.PRIVACY}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-eucalyptus underline underline-offset-2"
        >
          Leer la política de privacidad completa
        </Link>
        {notice.draft && <span className="ml-2 text-sm text-ink-faint">(texto en revisión)</span>}
      </p>
    </div>
  );
}
