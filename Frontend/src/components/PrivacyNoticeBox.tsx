import { Link } from 'react-router-dom';
import type { PrivacyNotice } from '@/interfaces';
import { PublicRoutes } from '@/models';

/**
 * Aviso breve de privacidad: lo que se hace con los datos que la persona
 * está por cargar o por confirmar. La primera frase queda a la vista y el
 * resto va en un acordeón cerrado (quien quiere leerlo lo abre); el aceptar
 * sigue siendo explícito en el checkbox del paso de confirmación. Siempre con
 * el link a la política completa (se abre en otra pestaña para no perder la
 * reserva).
 */
export function PrivacyNoticeBox({ notice }: { notice: PrivacyNotice }) {
  // el texto viene de la base en párrafos separados por una línea en blanco
  const [intro, ...rest] = notice.summary.trim().split(/\n\s*\n/);
  const details = rest.join('\n\n');

  return (
    <div className="rounded-(--radius-panel) border border-line bg-sheet text-[0.95rem] leading-relaxed text-ink-soft">
      <p className="px-4 pt-3.5 pb-3 whitespace-pre-line">{intro}</p>
      <details className="group border-t border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium text-eucalyptus select-none [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Ver el aviso de privacidad</span>
          <span className="hidden group-open:inline">Ocultar el aviso de privacidad</span>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="size-5 shrink-0 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 8 5 5 5-5" />
          </svg>
        </summary>
        <div className="px-4 pb-3.5">
          {details && <p className="whitespace-pre-line">{details}</p>}
          <p className={details ? 'mt-3' : ''}>
            <Link
              to={`/${PublicRoutes.PRIVACY}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-eucalyptus underline underline-offset-2"
            >
              Leer la política de privacidad completa
            </Link>
            {notice.draft && <span className="ml-2 text-sm text-ink-muted">(texto en revisión)</span>}
          </p>
        </div>
      </details>
    </div>
  );
}
