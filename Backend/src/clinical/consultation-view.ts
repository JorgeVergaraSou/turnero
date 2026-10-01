import { createHash } from 'crypto';
import { MedicalConsultationEntity } from './entities/medical-consultation.entity';

const toNumber = (value: string | null) =>
  value === null ? null : Number(value);
const byId = <T extends { id: number }>(items: T[] = []) =>
  [...items].sort((a, b) => a.id - b.id);

/** Vista de una consulta (mapeo explícito, nunca la entidad cruda). */
export function toConsultationView(c: MedicalConsultationEntity) {
  return {
    id: c.id,
    appointmentId: c.appointmentId,
    patientId: c.patientId,
    status: c.status,
    professional: c.professional && {
      id: c.professional.id,
      firstName: c.professional.user?.nombre,
      lastName: c.professional.user?.apellido,
      specialties: (c.professional.specialties ?? []).map((s) => s.name),
    },
    reason: c.reason,
    anamnesis: c.anamnesis,
    physicalExam: c.physicalExam,
    evolution: c.evolution,
    indications: c.indications,
    observations: c.observations,
    vitalSigns: {
      weightKg: toNumber(c.weightKg),
      heightCm: toNumber(c.heightCm),
      systolicBp: c.systolicBp,
      diastolicBp: c.diastolicBp,
      heartRate: c.heartRate,
      temperatureC: toNumber(c.temperatureC),
      oxygenSaturation: c.oxygenSaturation,
    },
    diagnoses: byId(c.diagnoses).map(
      ({ id, type, description, codeSystem, code }) => ({
        id,
        type,
        description,
        codeSystem,
        code,
      }),
    ),
    medications: byId(c.medications).map(
      ({ id, drugName, dose, frequency, duration, notes }) => ({
        id,
        drugName,
        dose,
        frequency,
        duration,
        notes,
      }),
    ),
    studyRequests: byId(c.studyRequests).map(
      ({ id, type, description, notes }) => ({
        id,
        type,
        description,
        notes,
      }),
    ),
    amendments: byId(c.amendments).map(
      ({ id, authorUserId, content, reason, createdAt }) => ({
        id,
        authorUserId,
        content,
        reason,
        createdAt,
      }),
    ),
    startedAt: c.startedAt,
    finalizedAt: c.finalizedAt,
    finalizedByUserId: c.finalizedByUserId,
    contentHash: c.contentHash,
  };
}

export type ConsultationView = ReturnType<typeof toConsultationView>;

/**
 * Hash SHA-256 del contenido clínico en el momento de finalizar. Orden de
 * claves y de ítems fijo (canónico), así el mismo contenido siempre da el
 * mismo hash — base para una futura firma digital / verificación de
 * integridad ("¿cambió algo desde que se finalizó?").
 */
export function computeContentHash(
  c: MedicalConsultationEntity,
  finalizedAt: Date,
  finalizedByUserId: number,
): string {
  const canonical = {
    consultationId: c.id,
    appointmentId: c.appointmentId,
    patientId: c.patientId,
    professionalId: c.professionalId,
    reason: c.reason,
    anamnesis: c.anamnesis,
    physicalExam: c.physicalExam,
    evolution: c.evolution,
    indications: c.indications,
    observations: c.observations,
    weightKg: toNumber(c.weightKg),
    heightCm: toNumber(c.heightCm),
    systolicBp: c.systolicBp,
    diastolicBp: c.diastolicBp,
    heartRate: c.heartRate,
    temperatureC: toNumber(c.temperatureC),
    oxygenSaturation: c.oxygenSaturation,
    diagnoses: byId(c.diagnoses).map((d) => [
      d.type,
      d.description,
      d.codeSystem,
      d.code,
    ]),
    medications: byId(c.medications).map((m) => [
      m.drugName,
      m.dose,
      m.frequency,
      m.duration,
      m.notes,
    ]),
    studyRequests: byId(c.studyRequests).map((s) => [
      s.type,
      s.description,
      s.notes,
    ]),
    finalizedAt: finalizedAt.toISOString(),
    finalizedByUserId,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
