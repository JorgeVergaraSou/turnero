import { Injectable, MessageEvent } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import moment from 'moment-timezone';
import { Observable, Subject } from 'rxjs';
import {
  AppointmentCalledPayload,
  AppointmentEvents,
} from '@/appointments/appointment.events';
import { SettingsService } from '@/settings/settings.service';
import { SETTINGS_CHANGED } from '@/settings/settings.events';
import { CLINIC_TIMEZONE } from '@/common/utils/clinic-time.util';
import { settingsErrorLogger } from '@/config/module-loggers';
import { formatCallName } from './call-name-format.util';

/**
 * Lo ÚNICO que sale por el stream hacia una TV por cada llamado. Se arma
 * campo por campo (lista blanca) y el nombre ya viene formateado por el
 * servidor (completo, abreviado o código, según la configuración): la TV
 * nunca recibe el nombre completo si se eligió otro formato. Jamás DNI,
 * obra social, especialidad, motivo ni datos clínicos.
 */
export interface DisplayCall {
  /** identifica el llamado (para no repetirlo al reconectar) */
  key: string;
  callNumber: number;
  /** lo que se lee en la pantalla */
  displayName: string;
  /** lo que dice la voz (igual a displayName salvo el código, que se deletrea) */
  spokenName: string;
  officeName: string;
  calledAt: string;
  /** hora local del consultorio, 'HH:mm:ss' */
  calledTime: string;
}

/** Configuración que necesita la TV (evento `config`). */
export interface DisplayConfig {
  enabled: boolean;
  voiceRepeats: number;
}

/** Cuántos llamados recientes se mandan al conectarse. */
export const SNAPSHOT_SIZE = 5;
/** Un llamado más viejo que esto no se muestra al conectarse. */
const SNAPSHOT_MAX_AGE_HOURS = 12;
/** Pings para que proxies y navegadores no cierren la conexión ociosa. */
const HEARTBEAT_MS = 20_000;
/** Conexiones simultáneas por pantalla; al pasarse se cierra la más vieja. */
export const MAX_STREAMS_PER_DEVICE = 3;

@Injectable()
export class DisplayStreamService {
  private readonly calls$ = new Subject<DisplayCall>();
  private readonly settingsChanged$ = new Subject<void>();
  private readonly connections = new Map<number, Set<() => void>>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
  ) {}

  @OnEvent(AppointmentEvents.CALLED)
  async onCalled(payload: AppointmentCalledPayload): Promise<void> {
    const { callNameFormat } = await this.settings.get();
    const name = formatCallName(callNameFormat, {
      firstName: payload.patientFirstName,
      lastName: payload.patientLastName,
      code: payload.appointmentCode,
    });
    this.calls$.next({
      key: `${payload.appointmentId}-${payload.callNumber}`,
      callNumber: payload.callNumber,
      displayName: name.displayName,
      spokenName: name.spokenName,
      officeName: payload.officeName,
      calledAt: payload.calledAt,
      calledTime: payload.calledTime,
    });
  }

  @OnEvent(SETTINGS_CHANGED)
  onSettingsChanged(): void {
    this.settingsChanged$.next();
  }

  /** Corta todos los streams abiertos de una pantalla (desactivada o con token nuevo). */
  closeDevice(deviceId: number): void {
    for (const close of [...(this.connections.get(deviceId) ?? [])]) close();
  }

  /**
   * Stream de una pantalla: `config` y `snapshot` con los últimos llamados
   * al conectarse, después un `call` por cada llamado nuevo, un `ping` de
   * latido, y `config` + `snapshot` de nuevo cada vez que cambia la
   * configuración (así la TV se actualiza sola, también el formato del nombre).
   */
  open(deviceId: number): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let ready = false;
      const buffer: DisplayCall[] = [];
      const sent = new Set<string>();

      const emitCall = (call: DisplayCall) => {
        if (sent.has(call.key)) return;
        sent.add(call.key);
        subscriber.next({ type: 'call', data: call });
      };

      const sendCurrentState = async () => {
        const settings = await this.settings.get();
        const config: DisplayConfig = {
          enabled: settings.callsEnabled,
          voiceRepeats: settings.callVoiceRepeats,
        };
        // con el sistema desactivado la TV no muestra ningún nombre
        const calls = settings.callsEnabled
          ? await this.recentCalls(settings.callNameFormat)
          : [];
        subscriber.next({ type: 'config', data: config });
        sent.clear();
        calls.forEach((c) => sent.add(c.key));
        subscriber.next({ type: 'snapshot', data: { calls } });
      };

      // se suscribe ANTES de consultar el snapshot: un llamado que ocurra
      // en el medio se guarda en `buffer` en vez de perderse
      const live = this.calls$.subscribe((call) =>
        ready ? emitCall(call) : buffer.push(call),
      );
      const changes = this.settingsChanged$.subscribe(() => {
        if (!ready) return;
        sendCurrentState().catch((error) =>
          settingsErrorLogger.error(
            `[DisplayStreamService] no se pudo actualizar la pantalla: ${error instanceof Error ? error.message : error}`,
          ),
        );
      });

      const close = () => subscriber.complete();
      this.register(deviceId, close);

      const heartbeat = setInterval(
        () => subscriber.next({ type: 'ping', data: {} }),
        HEARTBEAT_MS,
      );

      sendCurrentState()
        .then(() => {
          ready = true;
          buffer.splice(0).forEach(emitCall);
        })
        .catch((error) => subscriber.error(error));

      return () => {
        clearInterval(heartbeat);
        live.unsubscribe();
        changes.unsubscribe();
        this.unregister(deviceId, close);
      };
    });
  }

  /** Últimos llamados (el más nuevo primero), solo los campos de DisplayCall. */
  private async recentCalls(
    format: Parameters<typeof formatCallName>[0],
  ): Promise<DisplayCall[]> {
    const rows: Array<{
      appointmentId: number;
      callNumber: number;
      firstName: string;
      lastName: string;
      code: string;
      officeName: string;
      calledAt: Date;
    }> = await this.dataSource
      .createQueryBuilder()
      .select('call_.appointment_id', 'appointmentId')
      .addSelect('call_.call_number', 'callNumber')
      .addSelect('patient.first_name', 'firstName')
      .addSelect('patient.last_name', 'lastName')
      .addSelect('appointment.code', 'code')
      .addSelect('office.name', 'officeName')
      .addSelect('call_.called_at', 'calledAt')
      .from('appointment_calls', 'call_')
      .innerJoin(
        'appointments',
        'appointment',
        'appointment.id = call_.appointment_id',
      )
      .innerJoin('patients', 'patient', 'patient.id = appointment.patient_id')
      .innerJoin('offices', 'office', 'office.id = call_.office_id')
      .where('call_.called_at >= :since', {
        since: new Date(Date.now() - SNAPSHOT_MAX_AGE_HOURS * 3600 * 1000),
      })
      .orderBy('call_.called_at', 'DESC')
      .addOrderBy('call_.id', 'DESC')
      .limit(SNAPSHOT_SIZE)
      .getRawMany();

    return rows.map((r) => {
      const calledAt = new Date(r.calledAt);
      const name = formatCallName(format, {
        firstName: r.firstName,
        lastName: r.lastName,
        code: r.code,
      });
      return {
        key: `${r.appointmentId}-${r.callNumber}`,
        callNumber: Number(r.callNumber),
        displayName: name.displayName,
        spokenName: name.spokenName,
        officeName: r.officeName,
        calledAt: calledAt.toISOString(),
        calledTime: moment(calledAt).tz(CLINIC_TIMEZONE).format('HH:mm:ss'),
      };
    });
  }

  private register(deviceId: number, close: () => void): void {
    const set = this.connections.get(deviceId) ?? new Set<() => void>();
    this.connections.set(deviceId, set);
    // Set conserva el orden de inserción: el primero es el más viejo
    while (set.size >= MAX_STREAMS_PER_DEVICE) {
      const oldest = set.values().next().value as () => void;
      set.delete(oldest);
      oldest();
    }
    set.add(close);
  }

  private unregister(deviceId: number, close: () => void): void {
    const set = this.connections.get(deviceId);
    set?.delete(close);
    if (set && set.size === 0) this.connections.delete(deviceId);
  }
}
