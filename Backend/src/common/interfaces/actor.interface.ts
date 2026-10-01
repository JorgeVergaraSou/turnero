/**
 * Quién ejecuta una operación, para auditoría. `userId` es null en las
 * operaciones públicas (paciente sin cuenta reservando/cancelando).
 */
export interface Actor {
  userId: number | null;
  ip: string | null;
}
