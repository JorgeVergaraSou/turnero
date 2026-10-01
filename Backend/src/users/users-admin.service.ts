import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { UserEntity, passwordChangeTimestamp } from './entities/user.entity';
import { UsersService } from './users.service';
import { AdminUpdateUserDto } from './dto/admin-user.dto';
import { ProfessionalEntity } from '@/professionals/entities/professional.entity';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { Role } from '@/common/enums/role.enum';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { usersErrorLogger } from '@/config/module-loggers';

/**
 * Gestión de OTROS usuarios por un ADMIN (el autoservicio del propio
 * perfil sigue en AuthService.updateUser). Reglas que evitan dejar el
 * sistema en un estado roto:
 * - nunca queda sin ningún ADMIN activo (no se puede degradar ni dar de
 *   baja al último);
 * - un admin no se cambia el rol ni se da de baja a sí mismo;
 * - un MEDICO con perfil profesional activo no puede perder el rol (el
 *   perfil seguiría recibiendo turnos sin un médico que pueda atenderlos):
 *   primero se desactiva el perfil.
 * Todo queda auditado (qué campos, nunca valores ni contraseñas).
 */
@Injectable()
export class UsersAdminService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ProfessionalEntity)
    private readonly professionalRepository: Repository<ProfessionalEntity>,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  async update(
    id: number,
    dto: AdminUpdateUserDto,
    actor: Actor,
  ): Promise<void> {
    try {
      const user = await this.findWithDeleted(id);

      if (dto.role !== undefined && dto.role !== user.role) {
        if (id === actor.userId) {
          throw new BadRequestException('No podés cambiar tu propio rol');
        }
        if (user.role === Role.ADMIN && !user.deletedAt) {
          await this.assertNotLastAdmin(id);
        }
        if (user.role === Role.MEDICO) {
          const activeProfile = await this.professionalRepository.exists({
            where: { userId: id, active: true },
          });
          if (activeProfile) {
            throw new ConflictException(
              'Tiene un perfil profesional activo: desactivalo en Profesionales antes de cambiarle el rol',
            );
          }
        }
      }

      if (dto.email !== undefined && dto.email !== user.email) {
        const taken = await this.userRepository.exists({
          where: { email: dto.email, idUser: Not(id) },
          withDeleted: true,
        });
        if (taken) {
          throw new ConflictException(
            'Ese email ya está asociado a otro usuario',
          );
        }
      }

      const changes = Object.fromEntries(
        Object.entries(dto).filter(
          ([key, value]) =>
            value !== undefined && value !== user[key as keyof UserEntity],
        ),
      ) as Partial<UserEntity>;
      if (Object.keys(changes).length === 0) {
        return;
      }

      await this.userRepository.update(id, changes);
      await this.auditService.record({
        actor,
        action: AuditAction.USER_UPDATE,
        resourceType: 'user',
        resourceId: id,
        metadata: {
          fields: Object.keys(changes),
          ...(changes.role && { fromRole: user.role, toRole: changes.role }),
        },
      });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersAdminService.update',
        'Error al actualizar el usuario',
        { id },
      );
    }
  }

  /**
   * El admin define una clave nueva (ej. alguien que no tiene email para
   * recuperarla). Invalida cualquier token de recuperación pendiente.
   */
  async resetPassword(
    id: number,
    password: string,
    actor: Actor,
  ): Promise<void> {
    try {
      if (id === actor.userId) {
        throw new BadRequestException(
          'Para cambiar tu propia clave usá Mi perfil',
        );
      }
      await this.findWithDeleted(id);
      await this.userRepository.update(id, {
        password: await argon2.hash(password),
        passwordChangedAt: passwordChangeTimestamp(),
        failedLoginCount: 0,
        lockedUntil: null,
        resetPasswordToken: null,
        resetPasswordTokenExpiresAt: null,
      });
      await this.auditService.record({
        actor,
        action: AuditAction.USER_PASSWORD_RESET,
        resourceType: 'user',
        resourceId: id,
      });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersAdminService.resetPassword',
        'Error al restablecer la contraseña',
        { id },
      );
    }
  }

  async deactivate(id: number, actor: Actor): Promise<void> {
    try {
      if (id === actor.userId) {
        throw new BadRequestException('No podés darte de baja a vos mismo');
      }
      const user = await this.findWithDeleted(id);
      if (user.role === Role.ADMIN && !user.deletedAt) {
        await this.assertNotLastAdmin(id);
      }
      await this.usersService.darDeBajaUsuario(id);
      await this.auditService.record({
        actor,
        action: AuditAction.USER_DEACTIVATE,
        resourceType: 'user',
        resourceId: id,
      });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersAdminService.deactivate',
        'Ocurrió un error al desactivar el usuario',
        { id },
      );
    }
  }

  async activate(id: number, actor: Actor): Promise<void> {
    try {
      await this.usersService.activarUsuario(id);
      await this.auditService.record({
        actor,
        action: AuditAction.USER_ACTIVATE,
        resourceType: 'user',
        resourceId: id,
      });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersAdminService.activate',
        'Ocurrió un error al activar el usuario',
        { id },
      );
    }
  }

  /** saca el bloqueo por intentos fallidos antes de que venza */
  async unlock(id: number, actor: Actor): Promise<void> {
    try {
      await this.findWithDeleted(id);
      await this.usersService.clearLoginLock(id);
      await this.auditService.record({
        actor,
        action: AuditAction.USER_UNLOCK,
        resourceType: 'user',
        resourceId: id,
      });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersAdminService.unlock',
        'Ocurrió un error al desbloquear el usuario',
        { id },
      );
    }
  }

  private async findWithDeleted(id: number): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { idUser: id },
      withDeleted: true,
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  /** Lanza si `id` es el único ADMIN activo. */
  private async assertNotLastAdmin(id: number) {
    const otherActiveAdmins = await this.userRepository.count({
      where: { role: Role.ADMIN, idUser: Not(id) },
    });
    if (otherActiveAdmins === 0) {
      throw new ConflictException(
        'Es el único administrador activo: el sistema no puede quedar sin administradores',
      );
    }
  }
}
