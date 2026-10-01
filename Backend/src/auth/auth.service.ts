import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '@/users/users.service';
import { LoginDto } from './dto/login.dto';
import { UserActiveInterface } from '@/common/interfaces/user-active.interface';
import { RequestResetPasswordDto } from './dto/requestResetPassword.dto';
import { v4 as uuidv4 } from 'uuid';
import { UpdateUserDto } from '@/users/dto/update-user.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { getTransporter } from '@/config/mailer';
import * as argon2 from 'argon2';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { padToMinDuration } from '@/common/utils/timing-safe.util';
import { authErrorLogger } from '@/config/module-loggers';
import { insertLogger, selectLogger } from '@/config/db-loggers';
import { ProfileResponseDto } from './dto/responses/profile-response.dto';
import { UserListItemResponseDto } from './dto/responses/user-list-item-response.dto';
import { assertRealImage } from '@/common/upload/avatar-upload.config';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResult } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { randomUUID } from 'crypto';
import { UserEntity } from '@/users/entities/user.entity';
import {
  TwoFactorChallenge,
  TwoFactorService,
} from './two-factor/two-factor.service';
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '@/users/entities/user.entity';

/** mismo mensaje para usuario inexistente, clave incorrecta y cuenta
 * bloqueada: la respuesta no revela cuál de los tres fue */
const LOGIN_FAILED_MESSAGE = `Usuario o contraseña inválidos. Tras ${MAX_FAILED_LOGINS} intentos fallidos seguidos la cuenta se bloquea ${LOCK_MINUTES} minutos.`;

/** Tiempo de validez del token de recuperación de contraseña */
const RESET_PASSWORD_TOKEN_TTL_MINUTES = 10;

/** Piso de tiempo para login(), calibrado para cubrir un hash+verify de
 * argon2 con los parámetros default (~40-120ms) — así la rama
 * "nickUsuario no existe" no responde perceptiblemente más rápido que la
 * rama "contraseña incorrecta" o un login exitoso. No cierra el oráculo
 * contra un atacante que promedie muchísimas mediciones, pero saca la
 * señal obvia (respuesta instantánea vs. respuesta después de hashear). */
const LOGIN_MIN_DURATION_MS = 300;

/** Piso de tiempo para requestResetPassword(). La rama real hace una
 * escritura a la base y un envío real por SMTP, cuya latencia es variable
 * y no se puede empatar del todo con un delay fijo — esto reduce la señal
 * más obvia (respuesta instantánea si el nickUsuario no existe) pero no
 * elimina el oráculo por completo bajo mediciones estadísticas finas. */
const RESET_PASSWORD_REQUEST_MIN_DURATION_MS = 400;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  // auth.service.ts

  async registro(
    { password, nickUsuario, email, nombre, apellido, role }: RegisterDto,
    actor: Actor,
  ): Promise<void> {
    // nickUsuario es el identificador de login; el email es obligatorio
    // (es la única vía para que el usuario recupere su clave solo)
    const existeNick = await this.usersService.findOneByNick(nickUsuario);
    if (existeNick) {
      throw new HttpException(
        'El nombre de usuario ya existe',
        HttpStatus.CONFLICT,
      );
    }

    const existeEmail = await this.usersService.findOneByEmail(email);
    if (existeEmail) {
      throw new HttpException('El email ya existe', HttpStatus.CONFLICT);
    }

    try {
      const hashedPassword = await argon2.hash(password);

      const newUser = await this.usersService.nuevoUsuario({
        nickUsuario,
        nombre,
        apellido,
        role,
        email,
        password: hashedPassword,
      });

      if (!newUser) {
        throw new HttpException(
          'No se pudo crear el usuario',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 👉 Registrar en archivo insert.log
      insertLogger.info(
        `Usuario creado: ${JSON.stringify({
          id: newUser.idUser,
          nickUsuario: newUser.nickUsuario,
          nombre: newUser.nombre,
          apellido: newUser.apellido,
          email: newUser.email,
          role: newUser.role,
        })}`,
      );
      await this.auditService.record({
        actor,
        action: AuditAction.USER_CREATE,
        resourceType: 'user',
        resourceId: newUser.idUser,
        metadata: { role: newUser.role },
      });
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'AuthService.registro',
        'Ocurrio un error al crear el usuario',
        { nickUsuario },
      );
    }
  }
  // --------------- REGISTER FIN ---------------

  /** ----------------- INICIO LOGIN ------------------- */
  async login(
    { nickUsuario, password }: LoginDto,
    actor: Actor,
  ): Promise<{ token: string } | TwoFactorChallenge> {
    const startedAt = Date.now();
    try {
      // Buscar usuario incluyendo el campo password
      const user = await this.usersService.findByNickWithPassword(nickUsuario);

      // mismo mensaje genérico tanto si el nickUsuario no existe como si la
      // contraseña es incorrecta — así la respuesta no revela qué nombres
      // de usuario están registrados en el sistema. El padToMinDuration del
      // finally empareja además el tiempo de respuesta entre las tres ramas
      // (ver LOGIN_MIN_DURATION_MS) — puesto en el finally (no en cada
      // return/throw) para que ninguna salida nueva pueda saltearlo por
      // error.
      if (!user) {
        selectLogger.warn(
          `Login fallido: nickUsuario no encontrado -> ${nickUsuario}`,
        );
        await this.auditLoginFailed(actor, nickUsuario, null);
        throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
      }

      // cuenta bloqueada por intentos fallidos: se rechaza SIN mirar la
      // clave (si no, el atacante seguiría probando) y con el mismo mensaje
      // (no revela que la cuenta existe)
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await this.auditLoginFailed(
          actor,
          nickUsuario,
          user.idUser,
          'Cuenta bloqueada temporalmente por intentos fallidos',
        );
        throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
      }

      // Verificar la contraseña
      const isPasswordValid = await argon2.verify(user.password, password);
      if (!isPasswordValid) {
        selectLogger.warn(
          `Login fallido: contraseña incorrecta para -> ${nickUsuario}`,
        );
        const lockedNow = await this.usersService.registerFailedLogin(
          user.idUser,
        );
        await this.auditLoginFailed(
          actor,
          nickUsuario,
          user.idUser,
          lockedNow
            ? `Se bloqueó la cuenta ${LOCK_MINUTES} minutos por ${MAX_FAILED_LOGINS} intentos fallidos seguidos`
            : undefined,
        );
        throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
      }
      selectLogger.info(
        `Login exitoso: ${JSON.stringify({ nickUsuario: user.nickUsuario })}`,
      );

      // falta el 2.º paso: todavía NO hay sesión, solo un challenge
      if (await this.twoFactorService.isRequired(user)) {
        return await this.twoFactorService.challenge(user);
      }
      return await this.createSession(user, actor);
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'AuthService.login',
        'Ocurrió un error al realizar el login',
        { nickUsuario },
      );
    } finally {
      await padToMinDuration(startedAt, LOGIN_MIN_DURATION_MS);
    }
  }
  /**
   * Intento fallido: sin actor (no se sabe quién es), con el usuario que
   * se intentó (si existe) y el nick escrito, para detectar ataques a una
   * cuenta. El nick se recorta: lo escribe cualquiera.
   */
  private auditLoginFailed(
    actor: Actor,
    nickUsuario: string,
    targetUserId: number | null,
    reason?: string,
  ) {
    return this.auditService.record({
      actor: { ...actor, userId: null },
      action: AuditAction.LOGIN,
      resourceType: 'user',
      resourceId: targetUserId,
      result: AuditResult.DENIED,
      reason,
      metadata: { nickUsuario: String(nickUsuario).slice(0, 60) },
    });
  }
  /**
   * Emite la sesión (JWT) y audita el ingreso. La usan el login sin 2.º
   * paso y la verificación en dos pasos una vez aprobada.
   */
  async createSession(
    user: Pick<UserEntity, 'idUser' | 'nickUsuario' | 'role' | 'nombre'>,
    actor: Actor,
    metadata?: Record<string, unknown>,
  ): Promise<{ token: string }> {
    const payload = {
      idUser: user.idUser,
      nickUsuario: user.nickUsuario,
      role: user.role,
      name: user.nombre,
      // identificador de ESTA sesión: permite anularla al cerrar sesión
      jti: randomUUID(),
    };
    const token = await this.jwtService.signAsync(payload);
    await this.usersService.clearLoginLock(user.idUser);
    await this.auditService.record({
      actor: { ...actor, userId: user.idUser },
      action: AuditAction.LOGIN,
      resourceType: 'user',
      resourceId: user.idUser,
      ...(metadata && { metadata }),
    });
    return { token };
  }
  /** ===================== FIN LOGIN ===================== */

  /**
   * Cierra ESTA sesión en el servidor: el token queda anulado hasta que
   * vence (antes, cerrar sesión solo lo borraba del navegador y una copia
   * seguía sirviendo hasta 3 h). Las otras sesiones del usuario siguen.
   */
  async logout(
    session: { idUser: number; jti?: string; exp?: number },
    actor: Actor,
  ): Promise<void> {
    try {
      if (session.jti && session.exp) {
        await this.usersService.revokeToken(
          session.jti,
          session.idUser,
          new Date(session.exp * 1000),
        );
      }
      await this.auditService.record({
        actor,
        action: AuditAction.LOGOUT,
        resourceType: 'user',
        resourceId: session.idUser,
      });
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'AuthService.logout',
        'Ocurrió un error al cerrar la sesión',
      );
    }
  }

  /** INICIO RECUPERAR CLAVE */

  /**
   * Pide nickUsuario + email juntos, y el enlace se manda SOLO si el email
   * coincide con el que el usuario ya tiene guardado. En cualquier otro
   * caso (usuario inexistente, sin email, email que no coincide) se
   * responde igual y no se manda nada.
   *
   * Antes, a un usuario SIN email se le asociaba el que llegaba acá y se
   * le mandaba el enlace: cualquiera que supiera un nombre de usuario
   * podía poner su propio email y quedarse con la cuenta. Un usuario sin
   * email recupera la clave por el admin (restablecer-clave).
   */
  async requestResetPassword(dto: RequestResetPasswordDto): Promise<void> {
    const { nickUsuario, email } = dto;
    const startedAt = Date.now();

    try {
      const user = await this.usersService.findOneByNick(nickUsuario);

      // usuario inexistente, sin email o con otro email: se responde igual
      // que un pedido exitoso (sin mandar nada), así la respuesta no revela
      // qué usuarios existen ni qué email tienen. El padToMinDuration del
      // finally empareja además el tiempo de respuesta con el de un pedido
      // real (ver RESET_PASSWORD_REQUEST_MIN_DURATION_MS). No elimina del
      // todo el oráculo (la rama real manda un mail por SMTP, de latencia
      // variable) pero saca la señal más obvia.
      if (
        !user?.email ||
        user.email.trim().toLowerCase() !== email.trim().toLowerCase()
      ) {
        return;
      }

      const destinationEmail = user.email;

      const resetPasswordToken = uuidv4();
      const expiresAt = new Date(
        Date.now() + RESET_PASSWORD_TOKEN_TTL_MINUTES * 60 * 1000,
      );

      const { success } = await this.usersService.updateTokenResetPassword(
        user.idUser,
        resetPasswordToken,
        expiresAt,
      );
      if (!success) {
        throw new BadRequestException(
          'No se pudo generar el token de recuperación.',
        );
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      // nombre del remitente configurable por proyecto — cada app hija de
      // esta base puede setear MAIL_FROM_NAME en su propio .env en vez de
      // tener que tocar código para cambiar el nombre que ve el usuario.
      const fromName = process.env.MAIL_FROM_NAME || 'Soporte';

      await getTransporter().sendMail({
        from: `"${fromName}" <${process.env.MAIL_USER}>`,
        to: destinationEmail,
        subject: 'Recuperación de contraseña',
        html: `
          <b>¿Te olvidaste la clave? Hacé clic en el siguiente enlace:</b><br />
          <a href="${frontendUrl}/reset-password?token=${resetPasswordToken}">Recuperar contraseña</a>
        `,
      });
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'AuthService.requestResetPassword',
        'Ocurrió un error al procesar la solicitud de reseteo de clave',
        { nickUsuario },
      );
    } finally {
      await padToMinDuration(startedAt, RESET_PASSWORD_REQUEST_MIN_DURATION_MS);
    }
  }

  async resetPassword(dto: ResetPasswordDto, actor: Actor): Promise<void> {
    const { resetPasswordToken, password } = dto;

    try {
      const user =
        await this.usersService.findOneByResetPasswordToken(resetPasswordToken);

      if (
        !user ||
        !user.resetPasswordTokenExpiresAt ||
        user.resetPasswordTokenExpiresAt < new Date()
      ) {
        throw new BadRequestException('Token inválido o expirado');
      }

      const hashedPassword = await argon2.hash(password);

      const { success } = await this.usersService.updatePasswordByResetToken(
        user.idUser,
        hashedPassword,
      );

      if (!success) {
        throw new BadRequestException('No se pudo actualizar la contraseña');
      }
      await this.auditService.record({
        actor: { ...actor, userId: user.idUser },
        action: AuditAction.PASSWORD_RESET_EMAIL,
        resourceType: 'user',
        resourceId: user.idUser,
      });
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'AuthService.resetPassword',
        'Error al actualizar la contraseña',
        // nunca el token en los logs: es una credencial mientras no vence
      );
    }
  }

  /** FIN  RECUPERAR CLAVE*/

  /** INICIO UPDATE USER */
  async updateUser(
    id: number,
    updateUserDto: UpdateUserDto,
    actor: Actor,
  ): Promise<void> {
    try {
      await this.usersService.updateUser(id, updateUserDto);
      if (updateUserDto.password) {
        await this.auditService.record({
          actor,
          action: AuditAction.PASSWORD_CHANGE,
          resourceType: 'user',
          resourceId: id,
        });
      }
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'AuthService.updateUser',
        'Error al actualizar el usuario',
        { id },
      );
    }
  }

  /** actualiza la foto de perfil del usuario autenticado (autoservicio) */
  async actualizarFoto(
    idUser: number,
    file: Express.Multer.File,
  ): Promise<void> {
    try {
      if (!file) {
        throw new BadRequestException('Debe adjuntar una imagen');
      }
      await assertRealImage(file);

      await this.usersService.actualizarFoto(idUser, file.filename);
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'AuthService.actualizarFoto',
        'Error al actualizar la foto de perfil',
        { idUser },
      );
    }
  }

  async findAll(): Promise<UserListItemResponseDto[]> {
    try {
      const usersArray = await this.usersService.findAllUsers();

      return usersArray.map((user) => ({
        idUser: user.idUser,
        nickUsuario: user.nickUsuario,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        role: user.role,
        deletedAt: user.deletedAt,
        twoFactorEnabled: !!user.twoFactorEnabledAt,
        lockedUntil:
          user.lockedUntil && user.lockedUntil > new Date()
            ? user.lockedUntil
            : null,
      }));
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'AuthService.findAll',
        'Ocurrió un error al buscar los Usuarios',
      );
    }
  }

  async profile(user: UserActiveInterface): Promise<ProfileResponseDto> {
    try {
      // Buscamos el perfil según el nickUsuario del usuario activo (viene
      // del JWT) — nunca por un :id de la URL, así nadie puede pedir el
      // perfil de otro cambiando un parámetro.
      const profile = await this.usersService.findOneByNick(user.nickUsuario);
      if (!profile) {
        throw new NotFoundException('No existe perfil');
      }

      return {
        idUser: profile.idUser,
        nickUsuario: profile.nickUsuario,
        nombre: profile.nombre,
        apellido: profile.apellido,
        email: profile.email,
        role: profile.role,
        twoFactorEnabled: !!profile.twoFactorEnabledAt,
        fotoUrl: profile.imageFile
          ? `/uploads/avatars/${profile.imageFile}`
          : null,
      };
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'AuthService.profile',
        'Ocurrió un error al obtener el perfil',
        { nickUsuario: user.nickUsuario },
      );
    }
  }
}
