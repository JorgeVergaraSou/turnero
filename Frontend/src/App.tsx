import { BrowserRouter, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Provider } from 'react-redux'
import { PrivateRoutes, PublicRoutes, Roles } from './models'
import { AuthGuard } from './guards'
import store from './redux/store'
import RoleGuard from './guards/rol.guard'
import { LogoutRoute } from './components/Logout/LogoutRoute'
import { SessionSync } from './components/SessionSync'
import { Spinner } from './components/ui'
import RoutesWithNotFound from './utilities/RoutesWithNotFound.utility'
import PublicLayout from './layouts/PublicLayout'
import BookingPage from './pages/Public/Booking/Booking'
import MyAppointmentPage from './pages/Public/MyAppointment/MyAppointment'

// El flujo del paciente carga de entrada (es lo que se abre en el celular);
// las pantallas del personal se cargan recién cuando se usan.
const Login = lazy(() => import('./pages/Login/Login'))
const ResetPasswordPage = lazy(() => import('./pages/Login/ResetPassword'))
const DisplayPage = lazy(() => import('./pages/Display/DisplayScreen'))
const Private = lazy(() => import('./pages/Private/Private'))
const StaffLayout = lazy(() => import('./layouts/StaffLayout'))
const ProfilePage = lazy(() => import('./pages/Private/Profile'))
const NuevoUsuarioPage = lazy(() => import('./pages/Private/NuevoUsuario/NuevoUsuario'))
const ReceptionHomePage = lazy(() => import('./pages/Reception/ReceptionHome'))
const AgendaPage = lazy(() => import('./pages/Reception/Agenda'))
const NewAppointmentPage = lazy(() => import('./pages/Reception/NewAppointment'))
const PatientsPage = lazy(() => import('./pages/Reception/Patients'))
const AdminDashboardPage = lazy(() => import('./pages/Admin/Dashboard'))
const ProfessionalsPage = lazy(() => import('./pages/Admin/Professionals'))
const SchedulesPage = lazy(() => import('./pages/Admin/Schedules'))
const UsersPage = lazy(() => import('./pages/Admin/Users'))
const AuditPage = lazy(() => import('./pages/Admin/Audit'))
const DisplaysPage = lazy(() => import('./pages/Admin/Displays'))
const SettingsPage = lazy(() => import('./pages/Admin/Settings'))
const SpecialtiesPage = lazy(() => import('./pages/Admin/Catalogs').then((m) => ({ default: m.SpecialtiesPage })))
const HealthInsurancesPage = lazy(() => import('./pages/Admin/Catalogs').then((m) => ({ default: m.HealthInsurancesPage })))
const OfficesPage = lazy(() => import('./pages/Admin/Catalogs').then((m) => ({ default: m.OfficesPage })))
const DoctorHomePage = lazy(() => import('./pages/Doctor/DoctorHome'))
const AttentionPage = lazy(() => import('./pages/Doctor/Attention'))
const DoctorPatientsPage = lazy(() => import('./pages/Doctor/DoctorPatients'))
const DoctorPatientPage = lazy(() => import('./pages/Doctor/DoctorPatients').then((m) => ({ default: m.DoctorPatientPage })))

const { RECEPCION, ADMIN, MEDICO } = PrivateRoutes

function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <SessionSync />
        <Suspense fallback={<div className="px-6"><Spinner /></div>}>
          <RoutesWithNotFound>

            {/* Paciente, sin cuenta */}
            <Route element={<PublicLayout />}>
              <Route index element={<BookingPage />} />
              <Route path={PublicRoutes.MY_APPOINTMENT} element={<MyAppointmentPage />} />
            </Route>

            {/* TV de la sala de espera: sin layout ni sesión, usa token de pantalla */}
            <Route path={PublicRoutes.DISPLAY} element={<DisplayPage />} />

            {/* Acceso del personal */}
            <Route path={PublicRoutes.LOGIN} element={<Login />} />
            {/* Link que llega por mail — pública: quien la usa no puede loguearse */}
            <Route path={PublicRoutes.RESET_PASSWORD} element={<ResetPasswordPage />} />

            {/* Personal: AuthGuard (sesión) + RoleGuard (rol). El backend vuelve
                a exigir todo — esto solo evita mostrar pantallas inútiles. */}
            <Route element={<AuthGuard privateValidation={true} />}>
              <Route element={<StaffLayout />}>
                <Route path={`${PrivateRoutes.PRIVATE}/*`} element={<Private />} />
                <Route path={PrivateRoutes.PERFIL} element={<ProfilePage />} />

                <Route element={<RoleGuard roles={[Roles.ADMIN, Roles.RECEPCIONISTA]} />}>
                  <Route path={RECEPCION} element={<ReceptionHomePage />} />
                  <Route path={`${RECEPCION}/agenda`} element={<AgendaPage />} />
                  <Route path={`${RECEPCION}/nuevo-turno`} element={<NewAppointmentPage />} />
                  <Route path={`${RECEPCION}/pacientes`} element={<PatientsPage />} />
                </Route>

                <Route element={<RoleGuard roles={[Roles.ADMIN]} />}>
                  <Route path={ADMIN} element={<AdminDashboardPage />} />
                  <Route path={`${ADMIN}/profesionales`} element={<ProfessionalsPage />} />
                  <Route path={`${ADMIN}/horarios`} element={<SchedulesPage />} />
                  <Route path={`${ADMIN}/especialidades`} element={<SpecialtiesPage />} />
                  <Route path={`${ADMIN}/obras-sociales`} element={<HealthInsurancesPage />} />
                  <Route path={`${ADMIN}/consultorios`} element={<OfficesPage />} />
                  <Route path={`${ADMIN}/usuarios`} element={<UsersPage />} />
                  <Route path={`${ADMIN}/pantallas`} element={<DisplaysPage />} />
                  <Route path={`${ADMIN}/auditoria`} element={<AuditPage />} />
                  <Route path={`${ADMIN}/configuracion`} element={<SettingsPage />} />
                  {/* Alta de usuarios: no hay registro público */}
                  <Route path={PrivateRoutes.NUEVO_USUARIO} element={<NuevoUsuarioPage />} />
                </Route>

                <Route element={<RoleGuard roles={[Roles.MEDICO]} />}>
                  <Route path={MEDICO} element={<DoctorHomePage />} />
                  <Route path={`${MEDICO}/pacientes`} element={<DoctorPatientsPage />} />
                  <Route path={`${MEDICO}/pacientes/:patientId`} element={<DoctorPatientPage />} />
                  <Route path={`${MEDICO}/atencion/:appointmentId`} element={<AttentionPage />} />
                </Route>
              </Route>

              <Route path={PrivateRoutes.LOGOUT} element={<LogoutRoute />} />
            </Route>
          </RoutesWithNotFound>
        </Suspense>
      </BrowserRouter>
    </Provider>
  )
}

export default App
