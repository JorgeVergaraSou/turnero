import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '@/common/enums/role.enum';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true, name: 'id_user' })
  idUser!: number;

  /** identificador de login, único y obligatorio. Reemplaza a "email" en ese rol. */
  @Column({ length: 60, unique: true, nullable: false, name: 'nick_usuario' })
  nickUsuario!: string;

  @Column({ length: 60, nullable: false, name: 'nombre' })
  nombre!: string;

  @Column({ length: 60, nullable: false, name: 'apellido' })
  apellido!: string;

  /** email de contacto/recuperación. Opcional al crear el usuario: queda
   * asociado la primera vez que pide recuperar su clave (ver
   * AuthService.requestResetPassword). Único cuando no es nulo. */
  @Column({ type: 'varchar', unique: true, nullable: true, name: 'email' })
  email!: string | null;

  @Column({ nullable: false, select: false, name: 'password' })
  password!: string;

  @Column({
    type: 'uuid',
    unique: true,
    nullable: true,
    name: 'reset_password_token',
  })
  resetPasswordToken!: string | null;

  @Column({
    type: 'datetime',
    nullable: true,
    name: 'reset_password_token_expires_at',
  })
  resetPasswordTokenExpiresAt!: Date | null;

  /** último cambio de contraseña: los JWT emitidos ANTES dejan de valer
   * (ver AuthGuard). Así una sesión robada muere al cambiar la clave. */
  @Column({ type: 'datetime', nullable: true, name: 'password_changed_at' })
  passwordChangedAt!: Date | null;

  /** intentos de login fallidos SEGUIDOS (vuelve a 0 al entrar bien) */
  @Column({
    type: 'smallint',
    unsigned: true,
    default: 0,
    name: 'failed_login_count',
  })
  failedLoginCount!: number;

  /** bloqueada hasta esta hora por demasiados intentos fallidos */
  @Column({ type: 'datetime', nullable: true, name: 'locked_until' })
  lockedUntil!: Date | null;

  // ---- verificación en dos pasos (ver TwoFactorService) ----
  /** secreto TOTP CIFRADO (ver secret-box.util); nunca sale en respuestas */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
    name: 'two_factor_secret',
  })
  twoFactorSecret!: string | null;

  /** cuándo la activó (null = no configurada) */
  @Column({ type: 'datetime', nullable: true, name: 'two_factor_enabled_at' })
  twoFactorEnabledAt!: Date | null;

  /** último paso de 30 s usado: un código no se puede usar dos veces */
  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    select: false,
    name: 'two_factor_last_step',
  })
  twoFactorLastStep!: number | null;

  /** huellas (JSON) de los códigos de recuperación que quedan sin usar */
  @Column({
    type: 'text',
    nullable: true,
    select: false,
    name: 'two_factor_recovery_codes',
  })
  twoFactorRecoveryCodes!: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'image_file' })
  imageFile!: string | null;

  @Column({ type: 'enum', enum: Role, name: 'role' })
  role!: Role;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

/**
 * Momento del cambio de clave, TRUNCADO al segundo. La columna DATETIME no
 * guarda milésimas y MySQL las REDONDEA: un cambio a las 12:00:00,7 quedaba
 * 12:00:01, y un login inmediato (iat 12:00:00) se rechazaba como si fuera
 * anterior al cambio. Truncando, la base no redondea nada.
 */
export const passwordChangeTimestamp = () =>
  new Date(Math.floor(Date.now() / 1000) * 1000);

/** intentos fallidos seguidos que bloquean la cuenta */
export const MAX_FAILED_LOGINS = 10;
/** minutos que dura el bloqueo */
export const LOCK_MINUTES = 15;
