import { useState } from 'react';
import { receptionApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Patient } from '@/interfaces';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
  StatusBadge,
} from '@/components/ui';
import { healthInsuranceLabel } from '@/utilities';
import { PatientFormModal } from './PatientForm';
import { ageFrom, numericDate, shortTime } from '@/utilities';

/** Legajo ADMINISTRATIVO de pacientes: buscar, cargar, corregir datos. */
export function PatientsPage() {
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim());
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Patient | 'new' | null>(null);
  const [appointmentsOf, setAppointmentsOf] = useState<Patient | null>(null);

  const list = useAsync(() => receptionApi.searchPatients(term, page), [term, page]);
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.limit)) : 1;

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Datos de contacto e identificación. La información clínica solo la ven los médicos."
        actions={<Button onClick={() => setEditing('new')}>Nuevo paciente</Button>}
      />

      <SearchInput
        label="Buscar por DNI, nombre o apellido"
        value={q}
        onChange={(value) => {
          setQ(value);
          setPage(1);
        }}
        searching={list.loading || q.trim() !== term}
        wrapperClassName="mb-5 max-w-xl"
      />

      {/* mientras busca se siguen viendo los resultados anteriores: la
          lista no parpadea con cada tecla */}
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.items.length ? (
        <EmptyState
          title={term ? 'No hay pacientes que coincidan' : 'Todavía no hay pacientes cargados'}
          action={<Button onClick={() => setEditing('new')}>Cargar paciente</Button>}
        />
      ) : (
        <>
          <Panel className={`overflow-x-auto transition-opacity ${list.loading ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[40rem] text-left">
              <thead className="border-b border-line text-sm text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Paciente</th>
                  <th scope="col" className="px-4 py-3 font-medium">DNI</th>
                  <th scope="col" className="px-4 py-3 font-medium">Contacto</th>
                  <th scope="col" className="px-4 py-3 font-medium">Obra social</th>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {list.data.items.map((p) => {
                  const age = ageFrom(p.birthDate);
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3">
                        <span className="font-medium">
                          {p.lastName}, {p.firstName}
                        </span>
                        {age !== null && <span className="block text-sm text-ink-soft">{age} años</span>}
                      </td>
                      <td className="px-4 py-3 font-mono tabular">{p.documentNumber}</td>
                      <td className="px-4 py-3">
                        <span className="tabular">{p.phone}</span>
                        {p.email && <span className="block text-sm text-ink-soft">{p.email}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {healthInsuranceLabel(p.healthInsurance)}
                        {p.healthInsuranceNumber && (
                          <span className="block font-mono text-sm text-ink-soft tabular">
                            N.º {p.healthInsuranceNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setAppointmentsOf(p)}>
                            Turnos
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                            Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
          {totalPages > 1 && (
            <nav aria-label="Páginas" className="mt-4 flex items-center gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span className="text-ink-soft tabular">
                Página {page} de {totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Siguiente
              </Button>
            </nav>
          )}
        </>
      )}

      {editing && (
        <PatientFormModal
          key={editing === 'new' ? 'new' : editing.id}
          open
          patient={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
      {appointmentsOf && (
        <PatientAppointmentsModal patient={appointmentsOf} onClose={() => setAppointmentsOf(null)} />
      )}
    </div>
  );
}

function PatientAppointmentsModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { data, loading, error } = useAsync(
    () => receptionApi.appointments({ patientId: patient.id }),
    [patient.id],
  );
  return (
    <Modal open onClose={onClose} size="lg" title={`Turnos de ${patient.firstName} ${patient.lastName}`}>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorNotice message={error} />
      ) : !data?.length ? (
        <EmptyState title="Este paciente no tiene turnos" />
      ) : (
        <ul className="divide-y divide-line-soft">
          {[...data].reverse().map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="tabular">
                {numericDate(a.date)} {shortTime(a.startTime)} h
                <span className="block text-sm text-ink-soft">
                  {a.professional.lastName}, {a.specialty.name}
                </span>
              </span>
              <StatusBadge status={a.status} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default PatientsPage;
