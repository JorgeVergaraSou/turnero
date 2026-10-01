import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { Appointment } from '@/interfaces';
import { healthInsuranceLabel } from '@/utilities';

/**
 * Reserva web cuyo contacto no coincide con el legajo del DNI: puede ser
 * un familiar, un teléfono nuevo… o alguien usando un DNI ajeno (la
 * reserva pública no verifica identidad). Recepción lo confirma con el
 * paciente; si los datos nuevos son correctos, actualiza el legajo y la
 * alerta desaparece.
 */
const FIELD_LABEL = {
  name: 'nombre',
  phone: 'teléfono',
  email: 'email',
  healthInsurance: 'obra social',
  healthInsuranceNumber: 'n.º de afiliado',
} as const;

const describe = (fields: Appointment['contactMismatch']) =>
  fields.map((f) => FIELD_LABEL[f]).join(', ');

/** Marca compacta para listas y tablas. */
export function ContactMismatchBadge({ appointment }: { appointment: Appointment }) {
  if (appointment.contactMismatch.length === 0) return null;
  return (
    <span
      className="mt-1 inline-flex items-center gap-1 rounded-(--radius-control) bg-st-attention-wash px-1.5 py-0.5 text-xs font-medium text-st-attention"
      title={`Reservado por la web con ${describe(appointment.contactMismatch)} distinto al legajo. Confirmá con el paciente.`}
    >
      <ExclamationTriangleIcon className="size-3.5" aria-hidden />
      Datos distintos al legajo
    </span>
  );
}

/** Comparación completa, para el detalle del turno. */
export function ContactMismatchDetail({ appointment: a }: { appointment: Appointment }) {
  if (a.contactMismatch.length === 0) return null;
  const rows = [
    {
      field: 'name' as const,
      written: `${a.contactLastName}, ${a.contactFirstName}`,
      record: `${a.patient.lastName}, ${a.patient.firstName}`,
    },
    { field: 'phone' as const, written: a.contactPhone, record: a.patient.phone },
    { field: 'email' as const, written: a.contactEmail, record: a.patient.email },
    {
      field: 'healthInsurance' as const,
      written: healthInsuranceLabel(a.contactHealthInsurance),
      record: healthInsuranceLabel(a.patient.healthInsurance),
    },
    {
      field: 'healthInsuranceNumber' as const,
      written: a.contactHealthInsuranceNumber,
      record: a.patient.healthInsuranceNumber,
    },
  ].filter((r) => a.contactMismatch.includes(r.field));

  return (
    <div className="rounded-(--radius-control) border border-st-attention/40 bg-st-attention-wash/50 p-4">
      <p className="flex items-center gap-2 font-bold text-st-attention">
        <ExclamationTriangleIcon className="size-5" aria-hidden />
        Reservado por la web con datos distintos al legajo
      </p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-ink-soft">
            <th className="pb-1 font-normal" />
            <th className="pb-1 font-normal">Escribió al reservar</th>
            <th className="pb-1 font-normal">Legajo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field}>
              <td className="py-0.5 pr-3 text-ink-soft first-letter:uppercase">{FIELD_LABEL[r.field]}</td>
              <td className="py-0.5 pr-3 font-medium break-all">{r.written}</td>
              <td className="py-0.5 break-all">{r.record}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-ink-soft">
        Puede ser un familiar que reservó por el paciente o un teléfono nuevo, pero también alguien
        usando un DNI ajeno. Confirmalo con el paciente antes del turno. Si los datos nuevos son
        correctos, actualizá el legajo y esta alerta desaparece.
      </p>
    </div>
  );
}
