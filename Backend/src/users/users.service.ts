import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  UserEntity,
  passwordChangeTimestamp,
} from './entities/user.entity';
import { RevokedTokenEntity } from './entities/revoked-token.entity';
import * as argon2 from 'argon2';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { usersErrorLogger } from '@/config/module-loggers';
import { updateLogger, deleteLogger } from '@/config/db-loggers';
import { Role } from '@/common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RevokedTokenEntity)
    private readonly revokedTokenRepository: Repository<RevokedTokenEntity>,
  ) {}

  // ------------------------------------------------------------------
  // Sesiones anuladas (cerrar sesión)
  // ------------------------------------------------------------------

  /** anula una sesión (JWT) hasta que vence; idempotente */
  async revokeToken(jti: string, userId: number, expiresAt: Date) {
    await this.revokedTokenRepository.upsert({ jti, userId, expiresAt }, [
      'jti',
    ]);
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    return this.revokedTokenRepository.exists({ where: { jti } });
  }

  /** borra las anuladas que ya vencieron (ver RevokedTokensScheduler) */
  async deleteExpiredRevokedTokens(): Promise<number> {
    const result = await this.revokedTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }

  // ------------------------------------------------------------------
  // Bloqueo por intentos fallidos
  // ------------------------------------------------------------------

  /**
   * Suma un intento fallido (atómico: dos intentos simultáneos cuentan
   * los dos) y, al llegar a MAX_FAILED_LOGINS, bloquea la cuenta
   * LOCK_MINUTES. Devuelve true si este intento fue el que la bloqueó.
   */
  async registerFailedLogin(idUser: number): Promise<boolean> {
    await this.userRepository.increment({ idUser }, 'failedLoginCount', 1);
    const user = await this.userRepository.findOne({
      where: { idUser },
      select: ['idUser', 'failedLoginCount'],
    });
    if (!user || user.failedLoginCount < MAX_FAILED_LOGINS) return false;
    await this.userRepository.update(idUser, {
      failedLoginCount: 0,
      lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
    });
    return true;
  }

  /** login correcto, desbloqueo del admin o clave nueva: contador a cero */
  async clearLoginLock(idUser: number): Promise<void> {
    await this.userRepository.update(idUser, {
      failedLoginCount: 0,
      lockedUntil: null,
    });
  }

  async nuevoUsuario(createUserDto: CreateUserDto) {
    try {
      return await this.userRepository.save(createUserDto);
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.nuevoUsuario',
        'Error al crear el Usuario',
      );
    }
  }

  /** usado por AppService.seedInitialAdmin al bootear: como crear usuarios
   * requiere ser ADMIN, hace falta poder chequear si ya existe alguno antes
   * de decidir si hay que sembrar el primero. withDeleted:true para no
   * volver a sembrar si el único ADMIN existente fue dado de baja. */
  async existsAdmin(): Promise<boolean> {
    try {
      return await this.userRepository.exists({
        where: { role: Role.ADMIN },
        withDeleted: true,
      });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.existsAdmin',
        'Error al verificar si existe un administrador',
      );
    }
  }

  /** reemplaza la foto de perfil del usuario (autoservicio, ver
   * AuthController POST /auth/foto). Si ya tenía una foto anterior, la
   * borra del disco para no dejar archivos huérfanos en uploads/avatars. */
  async actualizarFoto(id: number, nombreArchivo: string): Promise<void> {
    try {
      const user = await this.userRepository.findOneBy({ idUser: id });

      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      if (user.imageFile) {
        const rutaAnterior = join(
          process.cwd(),
          'uploads',
          'avatars',
          user.imageFile,
        );

        if (existsSync(rutaAnterior)) {
          unlinkSync(rutaAnterior);
        }
      }

      await this.userRepository.update(id, { imageFile: nombreArchivo });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.actualizarFoto',
        'Error al actualizar la foto de perfil',
        { id },
      );
    }
  }

  /* lo que hace es buscar un usuario por mail y saber si existe */
  async findOneByEmail(email: string): Promise<UserEntity | null> {
    try {
      return await this.userRepository.findOneBy({ email });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.findOneByEmail',
        'Error al buscar el usuario',
        { email },
      );
    }
  }

  async findOneByNick(nickUsuario: string): Promise<UserEntity | null> {
    try {
      return await this.userRepository.findOneBy({ nickUsuario });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.findOneByNick',
        'Error al buscar el usuario',
        { nickUsuario },
      );
    }
  }

  async findOneById(idUser: number): Promise<UserEntity | null> {
    try {
      return await this.userRepository.findOneBy({ idUser });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.findOneById',
        'Error al buscar el usuario',
        { idUser },
      );
    }
  }

  async findOneByResetPasswordToken(
    resetPasswordToken: string,
  ): Promise<UserEntity | null> {
    try {
      return await this.userRepository.findOneBy({ resetPasswordToken });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.findOneByResetPasswordToken',
        'Error al buscar el usuario',
      );
    }
  }

  /** usado por el login: nickUsuario reemplazó a email como identificador
   * de acceso. Debido al select:false de la entidad, hace falta pedir el
   * password explícitamente acá. */
  async findByNickWithPassword(
    nickUsuario: string,
  ): Promise<UserEntity | null> {
    try {
      return await this.userRepository.findOne({
        where: { nickUsuario },
        select: [
          'idUser',
          'nickUsuario',
          'nombre',
          'email',
          'role',
          'password',
          'failedLoginCount',
          'lockedUntil',
          'twoFactorEnabledAt',
        ],
      });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.findByNickWithPassword',
        'Error al buscar el usuario',
        { nickUsuario },
      );
    }
  }

  async findByIdWithPassword(id: number): Promise<UserEntity | null> {
    try {
      return await this.userRepository.findOne({
        where: { idUser: id },
        select: [
          'idUser',
          'nickUsuario',
          'nombre',
          'email',
          'role',
          'password',
        ],
      });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.findByIdWithPassword',
        'Error al buscar el usuario',
        { id },
      );
    }
  }

  async findAllUsers(): Promise<UserEntity[]> {
    try {
      return await this.userRepository.find({
        withDeleted: true,
        order: { nombre: 'ASC' },
      });
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.findAllUsers',
        'Ocurrió un error al buscar los Usuarios',
      );
    }
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<void> {
    try {
      const fieldsUpdated: string[] = [];

      const userData = await this.findByIdWithPassword(id);

      if (!userData) {
        throw new NotFoundException('Usuario no encontrado');
      }

      if (updateUserDto.currentPassword === undefined) {
        throw new BadRequestException('Debes ingresar tu password actual');
      }

      // Verificar la contraseña actual con argon2
      const isPasswordValid = await argon2.verify(
        userData.password,
        updateUserDto.currentPassword,
      );

      if (!isPasswordValid) {
        throw new BadRequestException('Password incorrecto');
      }

      const { currentPassword, ...fields } = updateUserDto;
      const updateData: Partial<UserEntity> = { ...fields };

      if (
        updateUserDto.nickUsuario &&
        updateUserDto.nickUsuario !== userData.nickUsuario
      ) {
        const existeNick = await this.findOneByNick(updateUserDto.nickUsuario);

        if (existeNick) {
          throw new BadRequestException('El nombre de usuario ya está en uso');
        }

        fieldsUpdated.push('nickUsuario');
      }

      // Verificar siempre que se intenta actualizar el email
      if (updateUserDto.email && updateUserDto.email !== userData.email) {
        const existeEmail = await this.findOneByEmail(updateUserDto.email);

        if (existeEmail) {
          throw new BadRequestException('Ya se encuentra en uso este E-mail');
        }

        fieldsUpdated.push('email');
      }

      if (updateUserDto.nombre && updateUserDto.nombre !== userData.nombre) {
        fieldsUpdated.push('nombre');
      }

      // faltaba: cambiar SOLO el apellido no se guardaba (fieldsUpdated
      // quedaba vacío y la función salía sin actualizar)
      if (
        updateUserDto.apellido &&
        updateUserDto.apellido !== userData.apellido
      ) {
        fieldsUpdated.push('apellido');
      }

      if (updateUserDto.password) {
        const samePassword = await argon2.verify(
          userData.password,
          updateUserDto.password,
        );

        if (samePassword) {
          throw new BadRequestException(
            'Tu nueva clave no puede ser igual a la anterior',
          );
        }

        updateData.password = await argon2.hash(updateUserDto.password);
        updateData.passwordChangedAt = passwordChangeTimestamp();
        fieldsUpdated.push('password');
      }

      if (fieldsUpdated.length === 0) {
        return;
      }

      await this.userRepository.update(id, updateData);

      // 👉 solo se loguean los nombres de los campos tocados, nunca sus
      // valores (podría incluir password) — alcanza para auditar "qué"
      // cambió sin dejar datos sensibles en texto plano en logs/updates-*.txt.
      updateLogger.info(
        `Usuario actualizado (ID ${id}): campos ${JSON.stringify(fieldsUpdated)}`,
      );
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.updateUser',
        'Ocurrió un error al actualizar el usuario',
        { id },
      );
    }
  }

  async updateTokenResetPassword(
    id: number,
    token: string,
    expiresAt: Date,
  ): Promise<{ success: boolean }> {
    try {
      const result = await this.userRepository.update(id, {
        resetPasswordToken: token,
        resetPasswordTokenExpiresAt: expiresAt,
      });
      const success = !!(result.affected && result.affected > 0);

      // el token en sí nunca se loguea (es equivalente a una password
      // temporal) — solo que se generó uno y cuándo expira.
      if (success) {
        updateLogger.info(
          `Token de reset generado (ID ${id}), expira ${expiresAt.toISOString()}`,
        );
      }

      return { success };
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.updateTokenResetPassword',
        'No se pudo generar el token de recuperación',
        { id },
      );
    }
  }

  async updatePasswordByResetToken(
    id: number,
    hashedPassword: string,
  ): Promise<{ success: boolean }> {
    try {
      const result = await this.userRepository.update(id, {
        password: hashedPassword,
        passwordChangedAt: passwordChangeTimestamp(),
        failedLoginCount: 0,
        lockedUntil: null,
        resetPasswordToken: null,
        resetPasswordTokenExpiresAt: null,
      });
      const success = !!(result.affected && result.affected > 0);

      if (success) {
        updateLogger.info(`Password actualizada vía reset (ID ${id})`);
      }

      return { success };
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.updatePasswordByResetToken',
        'No se pudo actualizar la contraseña',
        { id },
      );
    }
  }

  async darDeBajaUsuario(id: number): Promise<void> {
    try {
      const user = await this.getUserWithDeleted(id); // Lanza NotFoundException si no existe

      if (user.deletedAt) {
        throw new BadRequestException('El usuario ya está inactivo');
      }

      await this.userRepository.softDelete(id);
      deleteLogger.info(`Usuario dado de baja (ID ${id}, soft-delete)`);
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.darDeBajaUsuario',
        'Ocurrió un error al desactivar el usuario',
        { id },
      );
    }
  }

  async activarUsuario(id: number): Promise<void> {
    try {
      const user = await this.getUserWithDeleted(id); // Lanza NotFoundException si no existe

      if (!user.deletedAt) {
        throw new BadRequestException('El usuario ya está activo');
      }

      await this.userRepository.restore(id);
      // restore() revierte un soft-delete — se audita con updateLogger
      // (no deleteLogger) porque semánticamente es la operación inversa,
      // no un borrado.
      updateLogger.info(`Usuario reactivado (ID ${id}, restore)`);
    } catch (error) {
      handleServiceError(
        error,
        usersErrorLogger,
        'UsersService.activarUsuario',
        'Ocurrió un error al activar el usuario',
        { id },
      );
    }
  }

  // Helper para obtener el usuario, incluyendo los borrados
  private async getUserWithDeleted(id: number): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { idUser: id },
      withDeleted: true,
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }
}
