/**
 * Asegura que una operación async tarde al menos `minMs` en total desde
 * `startedAt`, completando la diferencia con un delay artificial si
 * terminó antes. Se usa para cerrar oráculos de tiempo en operaciones
 * sensibles a enumeración (login, pedido de reseteo de clave) donde la
 * rama "no existe" es mucho más rápida que la rama real (hash de
 * contraseña, escritura a la base, envío de mail) y esa diferencia es
 * medible por quien mida los tiempos de respuesta.
 */
export async function padToMinDuration(
  startedAt: number,
  minMs: number,
): Promise<void> {
  const remainingMs = minMs - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }
}
