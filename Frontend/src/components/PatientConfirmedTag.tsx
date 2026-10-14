import type { Appointment } from '@/interfaces';

/**
 * "Confirmó que viene": el paciente avisó, desde el enlace del recordatorio,
 * que va a asistir. Es distinto de "llegó" (estado Confirmado): solo se
 * muestra mientras el turno sigue reservado, como pista para recepción y para
 * el médico, y no cambia nada en la sala de espera ni en los llamados.
 */
export function PatientConfirmedTag({
  appointment,
}: {
  appointment: Pick<Appointment, 'status' | 'patientConfirmedAt'>;
}) {
  if (appointment.status !== 'RESERVADO' || !appointment.patientConfirmedAt) return null;
  return (
    <span
      title="El paciente avisó que va a venir. Todavía no llegó."
      className="inline-flex items-center rounded-full border border-eucalyptus/40 px-2.5 py-0.5 text-sm font-medium whitespace-nowrap text-eucalyptus"
    >
      Confirmó que viene
    </span>
  );
}
