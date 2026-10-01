//src/common/upload/avatar-upload.config.ts

import { diskStorage } from 'multer';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { open, unlink } from 'fs/promises';

/** único lugar que decide qué mimetypes de imagen se aceptan — usado tanto
 * para filtrar el upload como para elegir la extensión con la que se
 * guarda (ver avatarStorage.filename más abajo: la extensión NUNCA sale
 * del nombre de archivo que manda el cliente). */
const MIME_A_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const avatarStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'avatars');

    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    // la extensión se deriva del mimetype ya validado por
    // avatarFileFilter (que corre antes y solo deja pasar mimetypes de
    // MIME_A_EXTENSION) — nunca del nombre de archivo original, que manda
    // el cliente y podría traer cualquier extensión (ej. .php) sin
    // relación real con el contenido subido.
    const extension = MIME_A_EXTENSION[file.mimetype] ?? '.jpg';
    cb(null, `${randomUUID()}${extension}`);
  },
});

export const avatarFileFilter = (
  req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!MIME_A_EXTENSION[file.mimetype]) {
    return cb(
      new BadRequestException('La foto debe ser una imagen (jpg, png o webp)'),
      false,
    );
  }

  cb(null, true);
};

/** Firma (primeros bytes) de cada formato aceptado. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.png': (b) =>
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.webp': (b) =>
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP',
};

/**
 * avatarFileFilter solo mira el Content-Type, que lo declara el cliente:
 * un HTML subido como "image/png" pasaba. Esto revisa el CONTENIDO real
 * ya guardado; si no es la imagen que dice ser, lo borra y rechaza.
 */
export async function assertRealImage(
  file: Express.Multer.File,
): Promise<void> {
  const extension = MIME_A_EXTENSION[file.mimetype];
  const handle = await open(file.path, 'r');
  const header = Buffer.alloc(12);
  try {
    await handle.read(header, 0, 12, 0);
  } finally {
    await handle.close();
  }
  if (!extension || !SIGNATURES[extension](header)) {
    await unlink(file.path).catch(() => undefined);
    throw new BadRequestException(
      'El archivo no es una imagen válida (jpg, png o webp)',
    );
  }
}
