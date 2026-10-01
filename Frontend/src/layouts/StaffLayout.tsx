import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { AppStore } from '@/redux/store';
import { Roles, StaffPaths } from '@/models';
import useLogout from '@/components/Logout/Logout';
import { useClinicSettings } from '@/hooks/useClinicSettings';

interface NavGroup {
  title: string;
  roles: Roles[];
  /** `roles` en un link lo restringe dentro del grupo */
  links: { to: string; label: string; end?: boolean; roles?: Roles[] }[];
}

/**
 * Menú por rol. Refleja lo que el backend permite (el backend es quien
 * realmente lo exige): ADMIN ve recepción + administración pero NO el
 * panel médico; MEDICO solo su panel.
 */
const NAV: NavGroup[] = [
  {
    title: 'Recepción',
    roles: [Roles.ADMIN, Roles.RECEPCIONISTA],
    links: [
      { to: StaffPaths.RECEPTION_HOME, label: 'Inicio', end: true, roles: [Roles.RECEPCIONISTA] },
      { to: StaffPaths.AGENDA, label: 'Agenda' },
      { to: StaffPaths.NEW_APPOINTMENT, label: 'Dar turno' },
      { to: StaffPaths.PATIENTS, label: 'Pacientes' },
    ],
  },
  {
    title: 'Consultorio',
    roles: [Roles.MEDICO],
    links: [
      { to: StaffPaths.DOCTOR_HOME, label: 'Turnos de hoy', end: true },
      { to: StaffPaths.DOCTOR_PATIENTS, label: 'Mis pacientes' },
    ],
  },
  {
    title: 'Administración',
    roles: [Roles.ADMIN],
    links: [
      { to: StaffPaths.ADMIN_HOME, label: 'Inicio', end: true },
      { to: StaffPaths.PROFESSIONALS, label: 'Profesionales' },
      { to: StaffPaths.SCHEDULES, label: 'Horarios y ausencias' },
      { to: StaffPaths.SPECIALTIES, label: 'Especialidades' },
      { to: StaffPaths.HEALTH_INSURANCES, label: 'Obras sociales' },
      { to: StaffPaths.OFFICES, label: 'Consultorios' },
      { to: StaffPaths.DISPLAYS, label: 'Pantallas de sala' },
      { to: StaffPaths.USERS, label: 'Usuarios' },
      { to: StaffPaths.AUDIT, label: 'Auditoría' },
      { to: StaffPaths.SETTINGS, label: 'Configuración' },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administración',
  RECEPCIONISTA: 'Recepción',
  MEDICO: 'Médico/a',
};

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-(--radius-control) px-3 py-2 ${isActive ? 'bg-white/12 font-medium text-white' : 'text-white/75 hover:bg-white/8 hover:text-white'}`;

/** Marco del personal: navegación lateral oscura (tinta), contenido en papel. */
export function StaffLayout() {
  const user = useSelector((state: AppStore) => state.user);
  const logOut = useLogout();
  const [open, setOpen] = useState(false);
  const { clinicName } = useClinicSettings();

  const groups = NAV.filter((g) => g.roles.includes(user.role));

  const nav = (
    <nav
      aria-label="Secciones"
      className="flex min-h-full flex-col gap-6 px-3 py-5"
      // cierra el menú del celular al tocar cualquier link
      onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}
    >
      <div className="flex items-center gap-2 px-3 font-bold text-white">
        <img src="/favicon.svg" alt="" className="size-7 rounded-md ring-1 ring-white/20" />
        {clinicName}
      </div>
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1 text-sm text-white/50">{group.title}</p>
          <ul className="grid gap-0.5">
            {group.links
              .filter((link) => !link.roles || link.roles.includes(user.role))
              .map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={link.end} className={linkClass}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-auto border-t border-white/12 px-3 pt-4">
        <p className="font-medium text-white">{user.name}</p>
        <p className="text-sm text-white/60">{ROLE_LABEL[user.role] ?? user.role}</p>
        <div className="mt-3 flex gap-3 text-sm">
          <NavLink to={StaffPaths.PROFILE} className="text-white/75 hover:text-white">
            Mi perfil
          </NavLink>
          <button type="button" onClick={logOut} className="text-white/75 hover:text-white">
            Cerrar sesión
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      {/* escritorio */}
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto bg-ink [scrollbar-color:rgb(255_255_255/0.25)_transparent] [scrollbar-width:thin] lg:block">{nav}</aside>

      {/* celular / tablet */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <span className="font-bold">{clinicName}</span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="staff-nav"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          className="rounded-(--radius-control) p-1.5 hover:bg-white/10"
        >
          {open ? <XMarkIcon className="size-6" /> : <Bars3Icon className="size-6" />}
        </button>
      </div>
      {open && (
        <div id="staff-nav" className="fixed inset-0 top-[3.25rem] z-20 overflow-y-auto bg-ink [scrollbar-color:rgb(255_255_255/0.25)_transparent] [scrollbar-width:thin] lg:hidden">
          {nav}
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

export default StaffLayout;
