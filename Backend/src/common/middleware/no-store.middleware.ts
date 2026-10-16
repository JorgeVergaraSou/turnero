import type { NextFunction, Request, Response } from 'express';

/**
 * Toda respuesta de la API lleva `Cache-Control: no-store`: lleva datos
 * personales y de salud, y no deben quedar en la caché del navegador (una
 * computadora compartida del consultorio) ni de un proxy. Los endpoints que
 * necesitan otra cosa (por ejemplo los streams de eventos) la fijan ellos: este
 * middleware corre antes y no pisa lo que el controlador ponga después.
 */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
