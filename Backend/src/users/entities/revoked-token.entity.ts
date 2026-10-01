import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * Sesiones (JWT) anuladas antes de vencer: al cerrar sesión, el `jti` del
 * token queda acá y el AuthGuard lo rechaza aunque la firma siga siendo
 * válida. Solo hace falta guardarlo hasta que el token vence (`expiresAt`);
 * una tarea programada borra los vencidos.
 */
@Entity('revoked_tokens')
export class RevokedTokenEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  jti!: string;

  @Column({ type: 'int', unsigned: true, name: 'user_id' })
  userId!: number;

  @Index('IDX_revoked_tokens_expires_at')
  @Column({ type: 'datetime', name: 'expires_at' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
