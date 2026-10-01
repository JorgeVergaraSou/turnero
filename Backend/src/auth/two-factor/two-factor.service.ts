import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsNull, LessThan, Repository } from 'typeorm';
import { UserEntity } from '@/users/entities/user.entity';
import { UsersService } from '@/users/users.service';
import { SettingsService } from '@/settings/settings.service';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResult } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { authErrorLogger } from '@/config/module-loggers';
import { parseRoles } from './two-factor-roles.util';
import { generateTotpSecret, matchTotp, otpauthUri } from './totp.util';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from './secret-box.util';

export type TwoFactorStage = 'setup' | 'verify';

/** Lo que devuelve el login cuando falta el segundo paso. */
export interface TwoFactorChallenge {
  twoFactor: TwoFactorStage;
  /** JWT corto que NO es una sesión: solo sirve para completar el 2.º paso */
  challengeToken: string;
}

const CHALLENGE_PURPOSE = '2fa';
const CHALLENGE_EXPIRES_IN = '10m';
const EXPIRED_MESSAGE =
  'La verificación venció. Volvé a ingresar tu usuario y contraseña.';
const WRONG_CODE_MESSAGE =
  'El código no es correcto. Probá con el que muestra ahora la app.';

/**
 * Verificación en dos pasos (TOTP, app tipo Google Authenticator).
 *
 * Flujo: el login con contraseña correcta NO devuelve una sesión si hace
 * falta el 2.º paso, sino un "challenge" (JWT de 10 min con purpose=2fa,
 * que el AuthGuard rechaza como sesión). Con ese challenge:
 * - primera vez: setup (QR) → enable (primer código) → sesión + códigos de
 *   recuperación;
 * - siguientes: verify (código de la app o de recuperación) → sesión.
 *
 * Es obligatoria para los roles elegidos en Configuración, y para
 * cualquiera que ya la haya activado (aunque después se saque su rol).
 */
@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  /** ¿Este usuario tiene que pasar por el 2.º paso? */
  async isRequired(user: UserEntity): Promise<boolean> {
    if (user.twoFactorEnabledAt) return true;
    const { twoFactorRoles } = await this.settingsService.get();
    return parseRoles(twoFactorRoles).includes(user.role);
  }

  async challenge(user: UserEntity): Promise<TwoFactorChallenge> {
    const stage: TwoFactorStage = user.twoFactorEnabledAt ? 'verify' : 'setup';
    const challengeToken = await this.jwtService.signAsync(
      { idUser: user.idUser, purpose: CHALLENGE_PURPOSE, stage },
      { expiresIn: CHALLENGE_EXPIRES_IN },
    );
    return { twoFactor: stage, challengeToken };
  }

  /** Primera vez: genera el secreto (cifrado) y devuelve lo que va en el QR. */
  async setup(challengeToken: string) {
    const user = await this.readChallenge(challengeToken, 'setup');
    const secret = generateTotpSecret();
    await this.userRepository.update(user.idUser, {
      twoFactorSecret: encryptSecret(secret),
    });
    const { clinicName } = await this.settingsService.get();
    return {
      otpauthUrl: otpauthUri(clinicName, user.nickUsuario, secret),
      // para cargarlo a mano si no se puede escanear el QR
      secret,
    };
  }

  /** Primer código correcto: queda activada; devuelve los códigos de recuperación (única vez). */
  async enable(challengeToken: string, code: string, actor: Actor) {
    const user = await this.readChallenge(challengeToken, 'setup');
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Primero escaneá el código QR.');
    }
    const step = matchTotp(decryptSecret(user.twoFactorSecret), code.trim());
    if (step === null) {
      return this.fail(user, actor);
    }
    const recoveryCodes = generateRecoveryCodes();
    await this.userRepository.update(user.idUser, {
      twoFactorEnabledAt: new Date(),
      twoFactorLastStep: step,
      twoFactorRecoveryCodes: JSON.stringify(
        recoveryCodes.map(hashRecoveryCode),
      ),
    });
    await this.auditService.record({
      actor: { ...actor, userId: user.idUser },
      action: AuditAction.TWO_FACTOR_ENABLE,
      resourceType: 'user',
      resourceId: user.idUser,
    });
    return { user, recoveryCodes };
  }

  /** Login con 2.º paso: código de la app o, si no, uno de recuperación. */
  async verify(challengeToken: string, code: string, actor: Actor) {
    const user = await this.readChallenge(challengeToken, 'verify');
    const clean = code.trim();

    if (/^\d{6}$/.test(clean)) {
      const step = user.twoFactorSecret
        ? matchTotp(decryptSecret(user.twoFactorSecret), clean)
        : null;
      // cada código sirve UNA vez: quien lo espíe no puede reusarlo
      if (step !== null && (await this.claimStep(user.idUser, step))) {
        return { user, method: 'app' as const };
      }
    } else if (await this.useRecoveryCode(user, clean)) {
      return { user, method: 'recovery' as const };
    }
    return this.fail(user, actor);
  }

  /** El admin la reinicia (celular perdido): en el próximo ingreso la vuelve a configurar. */
  async reset(id: number, actor: Actor): Promise<void> {
    try {
      if (id === actor.userId) {
        throw new BadRequestException(
          'No podés reiniciar tu propia verificación: pedíselo a otro administrador.',
        );
      }
      const user = await this.userRepository.findOneBy({ idUser: id });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      await this.userRepository.update(id, {
        twoFactorSecret: null,
        twoFactorEnabledAt: null,
        twoFactorLastStep: null,
        twoFactorRecoveryCodes: null,
      });
      await this.auditService.record({
        actor,
        action: AuditAction.TWO_FACTOR_RESET,
        resourceType: 'user',
        resourceId: id,
      });
    } catch (error) {
      handleServiceError(
        error,
        authErrorLogger,
        'TwoFactorService.reset',
        'Ocurrió un error al reiniciar la verificación en dos pasos',
        { id },
      );
    }
  }

  // ------------------------------------------------------------------

  private async readChallenge(
    token: string,
    stage: TwoFactorStage,
  ): Promise<UserEntity> {
    let payload: { idUser?: number; purpose?: string; stage?: string };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(EXPIRED_MESSAGE);
    }
    if (payload.purpose !== CHALLENGE_PURPOSE || !payload.idUser) {
      throw new UnauthorizedException(EXPIRED_MESSAGE);
    }
    const user = await this.userRepository.findOne({
      where: { idUser: payload.idUser },
      select: [
        'idUser',
        'nickUsuario',
        'nombre',
        'role',
        'lockedUntil',
        'twoFactorSecret',
        'twoFactorEnabledAt',
        'twoFactorLastStep',
        'twoFactorRecoveryCodes',
      ],
    });
    // dado de baja mientras tanto, o ya activó / le reiniciaron el 2FA
    const currentStage = user?.twoFactorEnabledAt ? 'verify' : 'setup';
    if (!user || currentStage !== stage || payload.stage !== stage) {
      throw new UnauthorizedException(EXPIRED_MESSAGE);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'La cuenta está bloqueada temporalmente por intentos fallidos.',
      );
    }
    return user;
  }

  /** Marca el paso como usado solo si es posterior al último (atómico). */
  private async claimStep(idUser: number, step: number): Promise<boolean> {
    const result = await this.userRepository.update(
      [
        { idUser, twoFactorLastStep: IsNull() },
        { idUser, twoFactorLastStep: LessThan(step) },
      ],
      { twoFactorLastStep: step },
    );
    return (result.affected ?? 0) > 0;
  }

  private async useRecoveryCode(
    user: UserEntity,
    code: string,
  ): Promise<boolean> {
    if (!/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/.test(code)) return false;
    const stored: string[] = JSON.parse(user.twoFactorRecoveryCodes ?? '[]');
    const hash = hashRecoveryCode(code);
    if (!stored.includes(hash)) return false;
    // se borra al usarlo: cada código de recuperación sirve una sola vez
    const result = await this.userRepository.update(
      {
        idUser: user.idUser,
        twoFactorRecoveryCodes: user.twoFactorRecoveryCodes!,
      },
      {
        twoFactorRecoveryCodes: JSON.stringify(
          stored.filter((h) => h !== hash),
        ),
      },
    );
    return (result.affected ?? 0) > 0;
  }

  /** Código incorrecto: cuenta como intento fallido (bloqueo) y se audita. */
  private async fail(user: UserEntity, actor: Actor): Promise<never> {
    const lockedNow = await this.usersService.registerFailedLogin(user.idUser);
    await this.auditService.record({
      actor: { ...actor, userId: null },
      action: AuditAction.LOGIN,
      resourceType: 'user',
      resourceId: user.idUser,
      result: AuditResult.DENIED,
      reason: lockedNow
        ? 'Código de verificación incorrecto; se bloqueó la cuenta por intentos fallidos'
        : 'Código de verificación incorrecto',
      metadata: { nickUsuario: user.nickUsuario },
    });
    throw new UnauthorizedException(WRONG_CODE_MESSAGE);
  }
}
