// src/config/mailer.ts
import * as nodemailer from 'nodemailer';

let transporterInstance: any = null;

/**
 * El transporter se crea recién en el primer uso, no al importar este
 * archivo: mailer.ts se importa en cadena desde auth.service.ts, y Node
 * resuelve esa cadena de imports antes de que ConfigModule.forRoot()
 * llegue a ejecutarse en app.module.ts — leer process.env acá arriba,
 * a nivel de módulo, se hubiera encontrado esas variables todavía sin cargar.
 */
export function getTransporter() {
  if (!transporterInstance) {
    const port = Number(process.env.MAIL_PORT) || 465;

    transporterInstance = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port,
      // true (TLS implícito) solo para 465; el resto de los puertos
      // comunes (ej. 587) usan STARTTLS, que nodemailer negocia solo
      // cuando `secure` es false. Antes esto quedaba hardcodeado en
      // `true` sin importar el puerto configurado, así que un
      // MAIL_PORT=587 rompía la conexión.
      secure: port === 465,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });
  }

  return transporterInstance;
}
