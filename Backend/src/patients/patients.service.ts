import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Not, Repository } from 'typeorm';
import { PatientEntity } from './entities/patient.entity';
import {
  CreatePatientDto,
  PatientDataDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { clinicNow } from '@/common/utils/clinic-time.util';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { patientsErrorLogger } from '@/config/module-loggers';
import { HealthInsurancesService } from '@/health-insurances/health-insurances.service';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(PatientEntity)
    private readonly patientRepository: Repository<PatientEntity>,
    private readonly auditService: AuditService,
    private readonly healthInsurancesService: HealthInsurancesService,
  ) {}

  /** Búsqueda administrativa por DNI (prefijo) o nombre/apellido. */
  async search(
    q: string | undefined,
    page = 1,
    limit = 20,
  ): Promise<Paginated<PatientEntity>> {
    try {
      const query = this.patientRepository
        .createQueryBuilder('patient')
        .leftJoinAndSelect('patient.healthInsurance', 'healthInsurance')
        .orderBy('patient.lastName', 'ASC')
        .addOrderBy('patient.firstName', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      const term = q?.trim();
      if (term) {
        const document = term.replace(/[.\s-]/g, '').toUpperCase();
        query.where(
          new Brackets((qb) =>
            qb
              .where('patient.documentNumber LIKE :document', {
                document: `${escapeLike(document)}%`,
              })
              .orWhere(
                "CONCAT(patient.lastName, ' ', patient.firstName) LIKE :name",
                { name: `%${escapeLike(term)}%` },
              )
              .orWhere(
                "CONCAT(patient.firstName, ' ', patient.lastName) LIKE :name",
              ),
          ),
        );
      }

      const [items, total] = await query.getManyAndCount();
      return { items, total, page, limit };
    } catch (error) {
      handleServiceError(
        error,
        patientsErrorLogger,
        'PatientsService.search',
        'Error al buscar pacientes',
      );
    }
  }

  async findOne(id: number): Promise<PatientEntity> {
    try {
      const patient = await this.patientRepository.findOne({
        where: { id },
        relations: { healthInsurance: true },
      });
      if (!patient) {
        throw new NotFoundException('Paciente no encontrado');
      }
      return patient;
    } catch (error) {
      handleServiceError(
        error,
        patientsErrorLogger,
        'PatientsService.findOne',
        'Error al buscar el paciente',
        { id },
      );
    }
  }

  async create(dto: CreatePatientDto, actor: Actor): Promise<PatientEntity> {
    try {
      this.assertBirthDate(dto.birthDate);
      await this.assertDocumentAvailable(dto.documentNumber);
      await this.healthInsurancesService.assertAssignable(
        dto.healthInsuranceId,
      );
      const patient = await this.patientRepository.save(
        this.patientRepository.create(this.toColumns(dto)),
      );
      await this.auditService.record({
        actor,
        action: AuditAction.PATIENT_CREATE,
        resourceType: 'patient',
        resourceId: patient.id,
        patientId: patient.id,
      });
      return await this.findOne(patient.id);
    } catch (error) {
      handleServiceError(
        error,
        patientsErrorLogger,
        'PatientsService.create',
        'Error al crear el paciente',
      );
    }
  }

  async update(
    id: number,
    dto: UpdatePatientDto,
    actor: Actor,
  ): Promise<PatientEntity> {
    try {
      const patient = await this.patientRepository.findOneBy({ id });
      if (!patient) {
        throw new NotFoundException('Paciente no encontrado');
      }
      this.assertBirthDate(dto.birthDate);
      if (
        dto.documentNumber !== undefined &&
        dto.documentNumber !== patient.documentNumber
      ) {
        await this.assertDocumentAvailable(dto.documentNumber, id);
      }
      // una obra social ya desactivada puede quedar si no se toca; asignar
      // una nueva exige que esté activa
      if (
        dto.healthInsuranceId !== undefined &&
        dto.healthInsuranceId !== patient.healthInsuranceId
      ) {
        await this.healthInsurancesService.assertAssignable(
          dto.healthInsuranceId,
        );
      }

      this.patientRepository.merge(patient, dto);
      // particular: no hay número de afiliado que guardar
      if (patient.healthInsuranceId === null) {
        patient.healthInsuranceNumber = null;
      }
      await this.patientRepository.save(patient);
      await this.auditService.record({
        actor,
        action: AuditAction.PATIENT_UPDATE,
        resourceType: 'patient',
        resourceId: id,
        patientId: id,
        // solo QUÉ campos cambiaron, nunca los valores (datos personales)
        metadata: { fields: Object.keys(dto) },
      });
      return await this.findOne(id);
    } catch (error) {
      handleServiceError(
        error,
        patientsErrorLogger,
        'PatientsService.update',
        'Error al actualizar el paciente',
        { id },
      );
    }
  }

  /**
   * Reserva pública: busca al paciente por DNI y, si no existe, lo crea.
   *
   * Si YA existe, sus datos NO se modifican con lo que llegó del formulario
   * público: cualquiera puede tipear el DNI de otra persona, y pisar el
   * teléfono/email de un paciente real desde un formulario sin login sería
   * un vector de suplantación. El contacto que se ingresó queda guardado
   * en el turno (contactPhone/contactEmail) y recepción lo concilia.
   */
  async findOrCreateForBooking(
    data: PatientDataDto,
    manager: EntityManager,
  ): Promise<{ patient: PatientEntity; created: boolean }> {
    this.assertBirthDate(data.birthDate);
    // valida la obra social declarada aunque el paciente ya exista: queda
    // en el turno como dato de contacto
    await this.healthInsurancesService.assertAssignable(
      data.healthInsuranceId,
      manager,
    );
    const repository = manager.getRepository(PatientEntity);
    const existing = await repository.findOneBy({
      documentNumber: data.documentNumber,
    });
    if (existing) {
      return { patient: existing, created: false };
    }
    try {
      const patient = await repository.save(
        repository.create(this.toColumns(data)),
      );
      return { patient, created: true };
    } catch (error) {
      // dos reservas simultáneas del mismo DNI nuevo: la otra ya lo creó
      const again = await repository.findOneBy({
        documentNumber: data.documentNumber,
      });
      if (again) {
        return { patient: again, created: false };
      }
      throw error;
    }
  }

  private toColumns(dto: PatientDataDto) {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      documentNumber: dto.documentNumber,
      phone: dto.phone,
      email: dto.email ?? null,
      birthDate: dto.birthDate ?? null,
      healthInsuranceId: dto.healthInsuranceId,
      healthInsuranceNumber: memberNumberFor(dto),
    };
  }

  private assertBirthDate(birthDate?: string) {
    if (
      birthDate &&
      (birthDate > clinicNow().date || birthDate < '1900-01-01')
    ) {
      throw new BadRequestException('La fecha de nacimiento no es válida');
    }
  }

  private async assertDocumentAvailable(
    documentNumber: string,
    exceptId?: number,
  ) {
    const exists = await this.patientRepository.exists({
      where: exceptId
        ? { documentNumber, id: Not(exceptId) }
        : { documentNumber },
    });
    if (exists) {
      throw new ConflictException('Ya existe un paciente con ese DNI');
    }
  }
}

/** escapa comodines de LIKE en texto ingresado por el usuario */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** El número de afiliado solo tiene sentido con obra social. */
export function memberNumberFor(data: {
  healthInsuranceId: number | null;
  healthInsuranceNumber?: string | null;
}): string | null {
  return data.healthInsuranceId === null
    ? null
    : (data.healthInsuranceNumber ?? null);
}
