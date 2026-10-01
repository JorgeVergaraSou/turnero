import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { ClinicSettingsEntity } from './entities/clinic-settings.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { settingsErrorLogger } from '@/config/module-loggers';
import { Role } from '@/common/enums/role.enum';
import { CallNameFormat } from '@/common/enums/call-name-format.enum';
import { SETTINGS_CHANGED } from './settings.events';
import { parseRoles } from '@/auth/two-factor/two-factor-roles.util';

const SETTINGS_ID = 1;

/** Todo lo configurable (pantalla de configuración del admin). */
export interface AdminSettings extends PublicSettings {
  reminderHoursBefore: number;
  publicMaxPendingPerPatient: number;
  twoFactorRoles: Role[];
  callNameFormat: CallNameFormat;
  callVoiceRepeats: number;
}

/** Lo que puede ver cualquiera (pantallas públicas). */
export interface PublicSettings {
  clinicName: string;
  contactPhone: string | null;
  publicBookingEnabled: boolean;
  bookingHorizonDays: number;
  publicCancelMinHours: number;
  /** si es false, el médico no puede llamar pacientes (el panel oculta el botón) */
  callsEnabled: boolean;
}

/**
 * Configuración del consultorio. Se lee en cada reserva/consulta de
 * disponibilidad, así que queda en memoria; se invalida al actualizarla.
 * (Con varias instancias de la API, cada una tomaría el cambio recién al
 * reiniciar o tras el TTL — por eso el TTL corto.)
 */
@Injectable()
export class SettingsService {
  private cache: { value: ClinicSettingsEntity; expiresAt: number } | null =
    null;
  private static readonly TTL_MS = 60_000;

  constructor(
    @InjectRepository(ClinicSettingsEntity)
    private readonly settingsRepository: Repository<ClinicSettingsEntity>,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async get(): Promise<ClinicSettingsEntity> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }
    try {
      const settings = await this.settingsRepository.findOneByOrFail({
        id: SETTINGS_ID,
      });
      this.cache = {
        value: settings,
        expiresAt: Date.now() + SettingsService.TTL_MS,
      };
      return settings;
    } catch (error) {
      handleServiceError(
        error,
        settingsErrorLogger,
        'SettingsService.get',
        'No se pudo leer la configuración del consultorio',
      );
    }
  }

  async getPublic(): Promise<PublicSettings> {
    const s = await this.get();
    return {
      clinicName: s.clinicName,
      contactPhone: s.contactPhone,
      publicBookingEnabled: s.publicBookingEnabled,
      bookingHorizonDays: s.bookingHorizonDays,
      publicCancelMinHours: s.publicCancelMinHours,
      callsEnabled: s.callsEnabled,
    };
  }

  async getAdmin(): Promise<AdminSettings> {
    const s = await this.get();
    return {
      ...(await this.getPublic()),
      reminderHoursBefore: s.reminderHoursBefore,
      publicMaxPendingPerPatient: s.publicMaxPendingPerPatient,
      twoFactorRoles: parseRoles(s.twoFactorRoles),
      callNameFormat: s.callNameFormat,
      callVoiceRepeats: s.callVoiceRepeats,
    };
  }

  async update(
    { twoFactorRoles, ...rest }: UpdateSettingsDto,
    actor: Actor,
  ): Promise<AdminSettings> {
    // los roles se guardan como texto ('ADMIN,MEDICO'), en orden fijo para
    // que el mismo conjunto no cuente como cambio
    const dto: Partial<ClinicSettingsEntity> = {
      ...rest,
      ...(twoFactorRoles && {
        twoFactorRoles: Object.values(Role)
          .filter((r) => twoFactorRoles.includes(r))
          .join(','),
      }),
    };
    try {
      const current = await this.settingsRepository.findOneByOrFail({
        id: SETTINGS_ID,
      });
      const changed = (
        Object.keys(dto) as (keyof ClinicSettingsEntity)[]
      ).filter((key) => dto[key] !== undefined && dto[key] !== current[key]);
      if (changed.length > 0) {
        await this.settingsRepository.update(SETTINGS_ID, {
          ...dto,
          updatedByUserId: actor.userId,
        });
        await this.auditService.record({
          actor,
          action: AuditAction.SETTINGS_UPDATE,
          resourceType: 'clinic_settings',
          resourceId: SETTINGS_ID,
          // configuración no es dato sensible: se guarda el antes/después
          metadata: Object.fromEntries(
            changed.map((key) => [key, { from: current[key], to: dto[key] }]),
          ),
        });
      }
      this.cache = null;
      if (changed.length > 0) {
        // después de guardar: las pantallas de sala se actualizan solas
        this.eventEmitter.emit(SETTINGS_CHANGED);
      }
      return this.getAdmin();
    } catch (error) {
      handleServiceError(
        error,
        settingsErrorLogger,
        'SettingsService.update',
        'No se pudo actualizar la configuración',
      );
    }
  }
}
