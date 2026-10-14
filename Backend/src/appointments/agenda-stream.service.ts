import { Injectable, MessageEvent } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';
import { AgendaChangedPayload, AppointmentEvents } from './appointment.events';

/**
 * Lo ÚNICO que sale por el stream: qué turno cambió (ids y fecha). Sin
 * nombres, DNI ni datos clínicos: el panel que lo recibe vuelve a pedir
 * la agenda con su propia sesión y sus propios permisos.
 */
export type AgendaChange = AgendaChangedPayload;

/** Pings para que proxies y navegadores no cierren la conexión ociosa. */
const HEARTBEAT_MS = 20_000;
/** Conexiones simultáneas por usuario (varias pestañas); al pasarse se cierra la más vieja. */
export const MAX_AGENDA_STREAMS_PER_USER = 5;

/**
 * Avisos en tiempo real de cambios en la agenda (Server-Sent Events), para
 * que el panel del médico y el de recepción se refresquen solos cuando, por
 * ejemplo, recepción marca que llegó un paciente.
 */
@Injectable()
export class AgendaStreamService {
  private readonly changes$ = new Subject<AgendaChange>();
  private readonly connections = new Map<number, Set<() => void>>();

  @OnEvent(AppointmentEvents.AGENDA_CHANGED)
  onAgendaChanged(payload: AgendaChange): void {
    this.changes$.next(payload);
  }

  /**
   * Stream de un usuario. `professionalId`: solo los cambios de los turnos
   * de ese profesional (panel médico); null: todos (recepción/administración).
   */
  open(
    userId: number,
    professionalId: number | null,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const close = () => subscriber.complete();
      this.register(userId, close);

      subscriber.next({ type: 'ready', data: {} });
      const live = this.changes$.subscribe((change) => {
        if (
          professionalId !== null &&
          change.professionalId !== professionalId
        ) {
          return;
        }
        subscriber.next({ type: 'change', data: change });
      });
      const heartbeat = setInterval(
        () => subscriber.next({ type: 'ping', data: {} }),
        HEARTBEAT_MS,
      );

      return () => {
        clearInterval(heartbeat);
        live.unsubscribe();
        this.unregister(userId, close);
      };
    });
  }

  private register(userId: number, close: () => void): void {
    const set = this.connections.get(userId) ?? new Set<() => void>();
    this.connections.set(userId, set);
    while (set.size >= MAX_AGENDA_STREAMS_PER_USER) {
      const oldest = set.values().next().value as () => void;
      set.delete(oldest);
      oldest();
    }
    set.add(close);
  }

  private unregister(userId: number, close: () => void): void {
    const set = this.connections.get(userId);
    set?.delete(close);
    if (set && set.size === 0) this.connections.delete(userId);
  }
}
