import { ProfessionalEntity } from '../entities/professional.entity';

export interface SpecialtySummary {
  id: number;
  name: string;
}

/** Respuesta admin: nunca expone la entidad cruda del usuario (password,
 * tokens de reset, etc. — misma barrera que ProfileResponseDto). */
export class ProfessionalResponseDto {
  id: number;
  userId: number;
  nickUsuario: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  active: boolean;
  /** false si el usuario MEDICO fue dado de baja (no puede loguearse) */
  userActive: boolean;
  specialties: SpecialtySummary[];

  static from(professional: ProfessionalEntity): ProfessionalResponseDto {
    return {
      id: professional.id,
      userId: professional.userId,
      nickUsuario: professional.user.nickUsuario,
      firstName: professional.user.nombre,
      lastName: professional.user.apellido,
      licenseNumber: professional.licenseNumber,
      active: professional.active,
      userActive: !professional.user.deletedAt,
      specialties: toSpecialtySummaries(professional),
    };
  }
}

/** Respuesta pública (reserva sin cuenta): solo lo necesario para elegir. */
export class PublicProfessionalResponseDto {
  id: number;
  firstName: string;
  lastName: string;
  specialties: SpecialtySummary[];

  static from(professional: ProfessionalEntity): PublicProfessionalResponseDto {
    return {
      id: professional.id,
      firstName: professional.user.nombre,
      lastName: professional.user.apellido,
      specialties: toSpecialtySummaries(professional),
    };
  }
}

function toSpecialtySummaries(
  professional: ProfessionalEntity,
): SpecialtySummary[] {
  return (professional.specialties ?? [])
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
