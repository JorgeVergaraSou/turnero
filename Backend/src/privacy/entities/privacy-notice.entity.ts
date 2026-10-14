import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Una versión del aviso de privacidad (aviso breve + política completa).
 * Solo se agregan versiones: el texto de una versión ya publicada nunca
 * cambia (triggers en la base), así se puede probar qué aceptó cada persona.
 * La versión vigente es la más alta.
 */
@Entity('privacy_notices')
export class PrivacyNoticeEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  version!: number;

  /** el aviso breve que se muestra junto a la casilla de la reserva */
  @Column({ type: 'text' })
  summary!: string;

  /** la política completa (página pública /privacidad) */
  @Column({ type: 'text' })
  policy!: string;

  /** true = borrador pendiente de revisión legal (se avisa en pantalla) */
  @Column({ type: 'boolean', default: false, name: 'is_draft' })
  isDraft!: boolean;

  /** SHA-256 del texto exacto (ver privacy-notice.util.ts) */
  @Column({ type: 'char', length: 64, name: 'content_hash' })
  contentHash!: string;

  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'created_by_user_id',
  })
  createdByUserId!: number | null;

  @Column({ type: 'datetime', precision: 3, name: 'created_at' })
  createdAt!: Date;
}
