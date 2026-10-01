import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisplayDeviceEntity } from './entities/display-device.entity';
import {
  CreateDisplayDeviceDto,
  UpdateDisplayDeviceDto,
} from './dto/display-device.dto';
import { generateDisplayToken, hashDisplayToken } from './display-token.util';
import { DisplayStreamService } from './display-stream.service';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { settingsErrorLogger } from '@/config/module-loggers';

/** Lo que ve el admin. NUNCA incluye el hash ni el token guardado. */
export interface DisplayDeviceView {
  id: number;
  name: string;
  active: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
}

/** Solo al crear o rotar: el token se muestra UNA vez y no se puede volver a ver. */
export interface DisplayDeviceWithToken extends DisplayDeviceView {
  token: string;
}

const toView = (d: DisplayDeviceEntity): DisplayDeviceView => ({
  id: d.id,
  name: d.name,
  active: d.active,
  lastSeenAt: d.lastSeenAt,
  createdAt: d.createdAt,
});

@Injectable()
export class DisplayDevicesService {
  constructor(
    @InjectRepository(DisplayDeviceEntity)
    private readonly repository: Repository<DisplayDeviceEntity>,
    private readonly stream: DisplayStreamService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<DisplayDeviceView[]> {
    try {
      const devices = await this.repository.find({ order: { name: 'ASC' } });
      return devices.map(toView);
    } catch (error) {
      handleServiceError(
        error,
        settingsErrorLogger,
        'DisplayDevicesService.findAll',
        'Error al buscar las pantallas',
      );
    }
  }

  /** Para el guard: la pantalla activa dueña de ese token, o null. */
  async findActiveByToken(token: string): Promise<DisplayDeviceEntity | null> {
    return this.repository.findOne({
      where: { tokenHash: hashDisplayToken(token), active: true },
    });
  }

  /** Marca de "visto por última vez" (la ve el admin). No es crítica. */
  touch(id: number): void {
    this.repository
      .update(id, { lastSeenAt: new Date() })
      .catch((error) =>
        settingsErrorLogger.error(
          `[DisplayDevicesService.touch] ${error instanceof Error ? error.message : error}`,
        ),
      );
  }

  async create(
    dto: CreateDisplayDeviceDto,
    actor: Actor,
  ): Promise<DisplayDeviceWithToken> {
    try {
      await this.assertNameAvailable(dto.name);
      const token = generateDisplayToken();
      const saved = await this.repository.save(
        this.repository.create({
          name: dto.name,
          tokenHash: hashDisplayToken(token),
        }),
      );
      await this.auditService.record({
        actor,
        action: AuditAction.DISPLAY_CREATE,
        resourceType: 'display_device',
        resourceId: saved.id,
      });
      return { ...toView(saved), token };
    } catch (error) {
      handleServiceError(
        error,
        settingsErrorLogger,
        'DisplayDevicesService.create',
        'Error al crear la pantalla',
      );
    }
  }

  async update(
    id: number,
    dto: UpdateDisplayDeviceDto,
    actor: Actor,
  ): Promise<DisplayDeviceView> {
    try {
      const device = await this.repository.findOneBy({ id });
      if (!device) throw new NotFoundException('Pantalla no encontrada');
      if (dto.name !== undefined && dto.name !== device.name) {
        await this.assertNameAvailable(dto.name, id);
      }
      this.repository.merge(device, dto);
      const saved = await this.repository.save(device);
      await this.auditService.record({
        actor,
        action: AuditAction.DISPLAY_UPDATE,
        resourceType: 'display_device',
        resourceId: id,
        metadata: { fields: Object.keys(dto) },
      });
      // desactivar corta el stream que ya está abierto, no solo los nuevos
      if (dto.active === false) this.stream.closeDevice(id);
      return toView(saved);
    } catch (error) {
      handleServiceError(
        error,
        settingsErrorLogger,
        'DisplayDevicesService.update',
        'Error al editar la pantalla',
        { id },
      );
    }
  }

  /** Cambia el token (si se perdió o se filtró): el anterior deja de valer
   * al instante y se corta el stream abierto con él. */
  async rotateToken(id: number, actor: Actor): Promise<DisplayDeviceWithToken> {
    try {
      const device = await this.repository.findOneBy({ id });
      if (!device) throw new NotFoundException('Pantalla no encontrada');
      const token = generateDisplayToken();
      device.tokenHash = hashDisplayToken(token);
      const saved = await this.repository.save(device);
      await this.auditService.record({
        actor,
        action: AuditAction.DISPLAY_TOKEN_ROTATE,
        resourceType: 'display_device',
        resourceId: id,
      });
      this.stream.closeDevice(id);
      return { ...toView(saved), token };
    } catch (error) {
      handleServiceError(
        error,
        settingsErrorLogger,
        'DisplayDevicesService.rotateToken',
        'Error al cambiar el token de la pantalla',
        { id },
      );
    }
  }

  private async assertNameAvailable(name: string, exceptId?: number) {
    const existing = await this.repository.findOneBy({ name });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Ya existe una pantalla con ese nombre');
    }
  }
}
