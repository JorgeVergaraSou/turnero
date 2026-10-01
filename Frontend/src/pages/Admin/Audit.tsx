import { useState } from 'react';
import { adminApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { AuditLogItem, AuditQuery } from '@/interfaces';
import {
  Button,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  SelectInput,
  Spinner,
  TextInput,
} from '@/components/ui';
import { addDays, clinicToday, dateTime } from '@/utilities';

/** Qué hizo alguien, en lenguaje de personas (no el código interno). */
const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'Inició sesión',
  LOGOUT: 'Cerró sesión',
  TWO_FACTOR_ENABLE: 'Configuró la verificación en dos pasos',
  TWO_FACTOR_RESET: 'Reinició la verificación en dos pasos de un usuario',
  USER_UNLOCK: 'Desbloqueó un usuario',
  PASSWORD_CHANGE: 'Cambió su contraseña',
  PASSWORD_RESET_EMAIL: 'Recuperó su contraseña por email',
  USER_CREATE: 'Creó un usuario',
  USER_UPDATE: 'Editó un usuario',
  USER_PASSWORD_RESET: 'Cambió la clave de un usuario',
  USER_DEACTIVATE: 'Dio de baja un usuario',
  USER_ACTIVATE: 'Reactivó un usuario',
  SETTINGS_UPDATE: 'Cambió la configuración',
  SPECIALTY_CREATE: 'Creó una especialidad',
  SPECIALTY_UPDATE: 'Editó una especialidad',
  HEALTH_INSURANCE_CREATE: 'Creó una obra social',
  HEALTH_INSURANCE_UPDATE: 'Editó una obra social',
  OFFICE_CREATE: 'Creó un consultorio',
  OFFICE_UPDATE: 'Editó un consultorio',
  PROFESSIONAL_CREATE: 'Dio de alta un profesional',
  PROFESSIONAL_UPDATE: 'Editó un profesional',
  SCHEDULE_CREATE: 'Cargó un horario',
  SCHEDULE_UPDATE: 'Editó un horario',
  SCHEDULE_EXCEPTION_CREATE: 'Cargó una ausencia u horario especial',
  SCHEDULE_EXCEPTION_UPDATE: 'Quitó una ausencia u horario especial',
  PATIENT_CREATE: 'Cargó un paciente',
  PATIENT_UPDATE: 'Editó datos de un paciente',
  APPOINTMENT_CREATE: 'Reservó un turno',
  APPOINTMENT_CONFIRM: 'Confirmó asistencia',
  APPOINTMENT_CANCEL: 'Canceló un turno',
  APPOINTMENT_RESCHEDULE: 'Reprogramó un turno',
  APPOINTMENT_NO_SHOW: 'Marcó ausente',
  APPOINTMENT_PUBLIC_LOOKUP: 'Consultó un turno con código y DNI',
  START_ATTENTION: 'Inició una atención',
  CALL_PATIENT: 'Llamó a un paciente a la sala',
  DISPLAY_CREATE: 'Creó una pantalla de sala',
  DISPLAY_UPDATE: 'Editó una pantalla de sala',
  DISPLAY_TOKEN_ROTATE: 'Cambió el token de una pantalla de sala',
  VIEW_PATIENT: 'Vio los datos de un paciente',
  VIEW_CLINICAL_HISTORY: 'Vio la historia clínica',
  VIEW_MEDICAL_CONSULTATION: 'Vio una consulta',
  CREATE_MEDICAL_CONSULTATION: 'Abrió una consulta',
  UPDATE_MEDICAL_CONSULTATION: 'Editó una consulta en borrador',
  FINALIZE_MEDICAL_CONSULTATION: 'Finalizó una consulta',
  AMEND_MEDICAL_CONSULTATION: 'Agregó una enmienda',
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administración',
  RECEPCIONISTA: 'Recepción',
  MEDICO: 'Médico/a',
};

/**
 * Auditoría: quién hizo qué, sobre qué paciente, y si fue permitido. No
 * muestra contenido clínico (tampoco se guarda). Pensada para revisar
 * accesos — por ejemplo, filtrar "clínicos" + "denegados".
 */
export function AuditPage() {
  const [filters, setFilters] = useState<AuditQuery>({
    from: addDays(clinicToday(), -7),
    to: clinicToday(),
  });
  const [page, setPage] = useState(1);
  const logs = useAsync(() => adminApi.auditLogs({ ...filters, page }), [filters, page]);
  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.total / logs.data.limit)) : 1;

  const setFilter = (patch: Partial<AuditQuery>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Auditoría"
        description="Registro de quién hizo qué. Nunca incluye el contenido de las historias clínicas."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <TextInput
          label="Desde"
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => setFilter({ from: e.target.value || undefined })}
          wrapperClassName="w-44"
        />
        <TextInput
          label="Hasta"
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => setFilter({ to: e.target.value || undefined })}
          wrapperClassName="w-44"
        />
        <SelectInput
          label="Tipo"
          value={filters.category ?? ''}
          onChange={(e) =>
            setFilter({ category: (e.target.value || undefined) as AuditQuery['category'] })
          }
          wrapperClassName="w-48"
        >
          <option value="">Todo</option>
          <option value="CLINICAL">Accesos clínicos</option>
          <option value="ACCESS">Inicios de sesión y contraseñas</option>
          <option value="ADMINISTRATIVE">Administrativo</option>
        </SelectInput>
        <SelectInput
          label="Resultado"
          value={filters.result ?? ''}
          onChange={(e) =>
            setFilter({ result: (e.target.value || undefined) as AuditQuery['result'] })
          }
          wrapperClassName="w-44"
        >
          <option value="">Todos</option>
          <option value="SUCCESS">Permitidos</option>
          <option value="DENIED">Denegados</option>
        </SelectInput>
        {filters.patientId && (
          <Button variant="ghost" className="h-11" onClick={() => setFilter({ patientId: undefined })}>
            Quitar filtro de paciente
          </Button>
        )}
        {logs.data && (
          <p className="ml-auto pb-2 text-ink-soft tabular">{logs.data.total} registros</p>
        )}
      </div>

      {logs.loading ? (
        <Spinner />
      ) : logs.error ? (
        <ErrorNotice message={logs.error} onRetry={logs.reload} />
      ) : !logs.data?.items.length ? (
        <EmptyState title="No hay registros con esos filtros" />
      ) : (
        <>
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left">
              <thead className="border-b border-line text-sm text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Cuándo</th>
                  <th scope="col" className="px-4 py-3 font-medium">Quién</th>
                  <th scope="col" className="px-4 py-3 font-medium">Qué hizo</th>
                  <th scope="col" className="px-4 py-3 font-medium">Paciente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {logs.data.items.map((log) => (
                  <AuditRow
                    key={log.id}
                    log={log}
                    onPatient={(patientId) => setFilter({ patientId })}
                  />
                ))}
              </tbody>
            </table>
          </Panel>
          {totalPages > 1 && (
            <nav aria-label="Páginas" className="mt-4 flex items-center gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Más recientes
              </Button>
              <span className="text-ink-soft tabular">
                Página {page} de {totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Anteriores
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function AuditRow({ log, onPatient }: { log: AuditLogItem; onPatient: (id: number) => void }) {
  const denied = log.result === 'DENIED';
  return (
    <tr className={denied ? 'bg-st-cancelled-wash/40' : ''}>
      <td className="px-4 py-3 align-top text-sm whitespace-nowrap tabular">{dateTime(log.createdAt)}</td>
      <td className="px-4 py-3 align-top">
        {log.actor ? (
          <>
            {log.actor.name}
            <span className="block text-sm text-ink-soft">{ROLE_LABEL[log.actor.role] ?? log.actor.role}</span>
          </>
        ) : log.action === 'LOGIN' ? (
          // intento fallido: no se sabe quién es, solo qué usuario probó
          <span className="text-ink-soft">
            Alguien, como «{String(log.metadata?.nickUsuario ?? '?')}»
            {log.ip && <span className="block font-mono text-sm tabular">{log.ip}</span>}
          </span>
        ) : (
          <span className="text-ink-soft">
            Paciente por la web
            {log.ip && <span className="block font-mono text-sm tabular">{log.ip}</span>}
          </span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <span className={log.clinical ? 'font-medium' : ''}>
          {log.action === 'LOGIN' && denied
            ? // el motivo (bloqueo, código de verificación) va debajo; sin motivo, fue la clave
              `Intentó iniciar sesión${log.reason ? '' : ' (usuario o contraseña incorrectos)'}`
            : log.action === 'LOGIN' && log.metadata?.twoFactor === 'recovery'
              ? 'Inició sesión con un código de recuperación'
              : (ACTION_LABEL[log.action] ?? log.action)}
        </span>
        {denied && <span className="ml-2 text-sm font-medium text-st-cancelled">Denegado</span>}
        {log.reason && <span className="block text-sm text-ink-soft">Motivo: {log.reason}</span>}
      </td>
      <td className="px-4 py-3 align-top">
        {log.patient ? (
          <button
            type="button"
            onClick={() => onPatient(log.patient!.id)}
            className="text-left hover:underline"
            title="Ver solo los registros de este paciente"
          >
            {log.patient.name ?? `Paciente #${log.patient.id} (no existe)`}
            {log.patient.documentNumber && (
              <span className="block font-mono text-sm text-ink-soft tabular">DNI {log.patient.documentNumber}</span>
            )}
          </button>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </td>
    </tr>
  );
}

export default AuditPage;
