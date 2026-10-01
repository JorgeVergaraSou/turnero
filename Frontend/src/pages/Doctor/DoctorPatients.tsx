import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doctorApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { StaffPaths } from '@/models';
import {
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
} from '@/components/ui';
import { ClinicalHistory } from './ClinicalHistory';
import { ageFrom, numericDate } from '@/utilities';

/** Pacientes con los que el médico tiene o tuvo turnos (su "cartera"). */
export function DoctorPatientsPage() {
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim());
  const list = useAsync(() => doctorApi.patients(term || undefined), [term]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Mis pacientes"
        description="Pacientes con los que tuviste o tenés turnos. Solo podés ver la historia clínica de ellos."
      />
      <SearchInput
        label="Buscar por DNI, nombre o apellido"
        value={q}
        onChange={setQ}
        searching={list.loading || q.trim() !== term}
        wrapperClassName="mb-5"
      />
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState title={term ? 'Ningún paciente coincide' : 'Todavía no tenés pacientes'} />
      ) : (
        <Panel as="div" className={`transition-opacity ${list.loading ? 'opacity-60' : ''}`}>
          <ul className="divide-y divide-line-soft">
            {list.data.map((p) => {
              const age = ageFrom(p.birthDate);
              return (
                <li key={p.id}>
                  <Link
                    to={StaffPaths.doctorPatient(p.id)}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-eucalyptus-wash/40"
                  >
                    <span>
                      <span className="font-medium">
                        {p.lastName}, {p.firstName}
                      </span>
                      {age !== null && <span className="ml-2 text-ink-soft">{age} años</span>}
                    </span>
                    <span className="font-mono text-sm text-ink-soft tabular">DNI {p.documentNumber}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/** Ficha del paciente + historia clínica completa (acceso auditado). */
export function DoctorPatientPage() {
  const patientId = Number(useParams().patientId);
  const patient = useAsync(() => doctorApi.patient(patientId), [patientId]);
  const me = useAsync(() => doctorApi.me(), []);

  if (patient.loading) return <Spinner />;
  if (patient.error || !patient.data)
    return (
      <div className="max-w-xl">
        <ErrorNotice message={patient.error || 'Paciente no encontrado'} />
        <Link to={StaffPaths.DOCTOR_PATIENTS} className="mt-4 inline-block text-eucalyptus underline underline-offset-2">
          Volver a mis pacientes
        </Link>
      </div>
    );

  const p = patient.data;
  const age = ageFrom(p.birthDate);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${p.firstName} ${p.lastName}`}
        description={
          <span className="tabular">
            {age !== null && `${age} años (${numericDate(p.birthDate!)}), `}DNI {p.documentNumber}, tel. {p.phone}
          </span>
        }
      />
      <h2 className="mb-3 text-xl font-bold">Historia clínica</h2>
      <ClinicalHistory patientId={patientId} myProfessionalId={me.data?.id} />
    </div>
  );
}

export default DoctorPatientsPage;
