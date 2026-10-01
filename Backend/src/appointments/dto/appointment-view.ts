import { AppointmentEntity } from '../entities/appointment.entity';
import { AppointmentSource } from '../appointment-status';
import { contactMismatch } from '../contact-mismatch.util';

/**
 * Vista de un turno para recepción/admin/médico. Mapeo explícito: nunca se
 * devuelve la entidad cruda (arrastraría el usuario del profesional con
 * todas sus columnas). Solo datos administrativos — nada clínico.
 */
export function toAppointmentView(a: AppointmentEntity) {
  return {
    id: a.id,
    code: a.code,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    source: a.source,
    contactFirstName: a.contactFirstName,
    contactLastName: a.contactLastName,
    contactPhone: a.contactPhone,
    contactEmail: a.contactEmail,
    /** obra social declarada al reservar (null = particular) */
    contactHealthInsurance: healthInsuranceView(
      a.contactHealthInsuranceId,
      a.contactHealthInsurance,
    ),
    contactHealthInsuranceNumber: a.contactHealthInsuranceNumber,
    // solo reservas web: lo que escribió quien reservó vs. el legajo (una
    // posible reserva con DNI ajeno). Se calcula al leer: si recepción
    // actualiza el legajo con los datos nuevos, la alerta desaparece.
    contactMismatch:
      a.source === AppointmentSource.PUBLICO && a.patient
        ? contactMismatch({
            contact: {
              firstName: a.contactFirstName,
              lastName: a.contactLastName,
              phone: a.contactPhone,
              email: a.contactEmail,
              healthInsuranceId: a.contactHealthInsuranceId,
              healthInsuranceNumber: a.contactHealthInsuranceNumber,
            },
            patient: a.patient,
          })
        : [],
    cancellationReason: a.cancellationReason,
    createdAt: a.createdAt,
    patient: a.patient && {
      id: a.patient.id,
      firstName: a.patient.firstName,
      lastName: a.patient.lastName,
      documentNumber: a.patient.documentNumber,
      phone: a.patient.phone,
      email: a.patient.email,
      healthInsurance: healthInsuranceView(
        a.patient.healthInsuranceId,
        a.patient.healthInsurance,
      ),
      healthInsuranceNumber: a.patient.healthInsuranceNumber,
    },
    professional: a.professional && {
      id: a.professional.id,
      firstName: a.professional.user?.nombre,
      lastName: a.professional.user?.apellido,
    },
    specialty: a.specialty && { id: a.specialty.id, name: a.specialty.name },
    office: a.office && {
      id: a.office.id,
      name: a.office.name,
      address: a.office.address,
      locationDetails: a.office.locationDetails,
    },
  };
}

export type AppointmentView = ReturnType<typeof toAppointmentView>;

/** null = particular. Si la relación no vino cargada, al menos el id. */
function healthInsuranceView(
  id: number | null,
  entity: { id: number; name: string } | null | undefined,
) {
  if (id === null) return null;
  return { id, name: entity?.name ?? null };
}

/**
 * Vista pública (código + DNI): lo que el paciente necesita para ir al
 * turno. Del paciente solo el nombre y la inicial del apellido — quien
 * tiene código + DNI ya sabe de quién es, pero no hace falta devolver más.
 */
export function toPublicAppointmentView(a: AppointmentEntity) {
  return {
    code: a.code,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    // el nombre que se escribió al reservar, no el del legajo (ver entity)
    patientName: `${a.contactFirstName} ${a.contactLastName.charAt(0)}.`,
    professional: {
      firstName: a.professional.user.nombre,
      lastName: a.professional.user.apellido,
    },
    specialty: a.specialty.name,
    office: {
      name: a.office.name,
      address: a.office.address,
      locationDetails: a.office.locationDetails,
      phone: a.office.phone,
    },
  };
}
