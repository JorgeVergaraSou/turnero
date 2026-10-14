/**
 * Avisa por email que algo falló con los respaldos. Lo llama systemd
 * (OnFailure=) o backup.sh. Usa el SMTP que ya tiene la app (MAIL_*, del
 * .env de la app, que se carga acá) y no manda nada clínico: solo el
 * nombre del servidor y qué falló. Uso:
 *   ALERT_TO=alguien@dominio node dist/backup/notify.js "motivo"
 * Sin ALERT_TO o sin SMTP configurado, lo dice y sale con error (así queda en
 * el journal), pero nunca imprime claves.
 */
import 'dotenv/config';
import { hostname } from 'os';
import { getTransporter } from '../config/mailer';

async function main(): Promise<number> {
  const to = process.env.ALERT_TO;
  const reason = process.argv.slice(2).join(' ').trim() || 'El respaldo falló.';
  if (!to) {
    console.error('Falta ALERT_TO: no hay a quién avisar. Motivo: ' + reason);
    return 1;
  }
  if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD) {
    console.error(
      'No hay SMTP configurado (MAIL_USER/MAIL_PASSWORD). Motivo: ' + reason,
    );
    return 1;
  }
  const from = process.env.MAIL_FROM_NAME || 'Soporte';
  await getTransporter().sendMail({
    from: `"${from}" <${process.env.MAIL_USER}>`,
    to,
    subject: `[Turnero] Problema con los respaldos en ${hostname()}`,
    text: [
      `Servidor: ${hostname()}`,
      `Fecha: ${new Date().toISOString()}`,
      '',
      reason,
      '',
      'Qué hacer: entrar al servidor y ver "journalctl -u turnero-backup" para ver el detalle.',
      'Mientras no se resuelva, no hay un respaldo reciente de la base de datos.',
    ].join('\n'),
  });
  console.log('Aviso enviado a ' + to);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(
      'No se pudo enviar el aviso:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  },
);
