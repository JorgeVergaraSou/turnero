import { NavLink, Outlet } from 'react-router-dom';
import { PublicRoutes } from '@/models';
import { useClinicSettings } from '@/hooks/useClinicSettings';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-(--radius-control) px-3 py-2 text-[0.95rem] whitespace-nowrap ${isActive ? 'bg-sheet font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line)]' : 'text-ink-soft hover:text-ink'}`;

/** Marco del flujo del paciente: mobile-first, una columna, sin distracciones. */
export function PublicLayout() {
  const { clinicName } = useClinicSettings();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
        <NavLink to="/" className="flex min-w-0 items-center gap-2 leading-tight font-bold">
          <img src="/favicon.svg" alt="" className="size-7" />
          {clinicName}
        </NavLink>
        <nav aria-label="Turnos" className="flex gap-1">
          <NavLink to="/" end className={linkClass}>
            Pedir turno
          </NavLink>
          <NavLink to={`/${PublicRoutes.MY_APPOINTMENT}`} className={linkClass}>
            Mi turno
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-8 pb-28 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-2xl px-4 pb-8 text-sm text-ink-faint sm:px-6">
        <NavLink to={`/${PublicRoutes.LOGIN}`} className="hover:text-ink-soft">
          Acceso del personal
        </NavLink>
      </footer>
    </div>
  );
}

export default PublicLayout;
