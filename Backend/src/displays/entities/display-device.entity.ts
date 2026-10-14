import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Pantalla de sala. Nunca se borra: se desactiva (`active=false`), que
 * además corta el stream abierto. */
@Entity('display_devices')
export class DisplayDeviceEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 80, unique: true })
  name!: string;

  /** SHA-256 (hex) del token. `select: false`: ninguna consulta lo trae por
   * accidente; solo se filtra por él al validar un token. */
  @Column({
    type: 'char',
    length: 64,
    unique: true,
    select: false,
    name: 'token_hash',
  })
  tokenHash!: string;

  /**
   * El token cifrado (AES-256-GCM): solo para que el ADMIN pueda volver a ver
   * el enlace. La entidad nunca sale cruda por la API (se mapea a mano) y el
   * token solo se descifra en `reveal`, con auditoría. null = pantalla
   * creada antes de que se pudiera recuperar: hay que cambiarle el token.
   * La autenticación sigue usando únicamente el hash.
   */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'token_encrypted',
  })
  tokenEncrypted!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'datetime', nullable: true, name: 'last_seen_at' })
  lastSeenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
