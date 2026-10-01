import { useEffect, useState, type FormEvent } from 'react';
import { useDisplayStream, type StreamStatus } from '@/hooks/useDisplayStream';
import { useCallAnnouncer } from '@/hooks/useCallAnnouncer';
import type { VoiceStatus } from '@/utilities/callAnnouncer.utility';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import type { DisplayCall } from '@/interfaces';
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline';
import { clinicTime } from '@/utilities';

/**
 * Pantalla de la sala de espera (TV). Ruta pública `/pantalla`, sin menú ni
 * sesión de usuario: se conecta al stream de llamados con un TOKEN DE
 * PANTALLA que el administrador genera y que solo sirve para leer ese
 * stream. El token se guarda en este navegador (localStorage) y también
 * puede llegar en el enlace como `/pantalla#token=…`: el fragmento no viaja
 * al servidor y se borra de la barra de direcciones apenas se guarda.
 *
 * Pensada para leerse a varios metros: tamaños en vw/vh (escala con la TV),
 * alto contraste sobre fondo oscuro y un solo movimiento (el llamado nuevo).
 */

const TOKEN_KEY = 'display-token';
const TOKEN_PATTERN = /^dsp_[A-Za-z0-9_-]{43}$/;

function storeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sin almacenamiento: la pantalla anda igual hasta que se recargue
  }
}

function readInitialToken(): string | null {
  try {
    const fromLink = /(?:^|[#&])token=([^&]+)/.exec(window.location.hash)?.[1];
    if (fromLink) {
      const token = decodeURIComponent(fromLink);
      storeToken(token);
      // el token no tiene que quedar a la vista en la barra ni en el historial
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return token;
    }
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export default function DisplayScreen() {
  const [token, setToken] = useState<string | null>(readInitialToken);

  const save = (value: string) => {
    storeToken(value);
    setToken(value);
  };

  if (!token) return <Setup onSave={save} />;
  return <Board key={token} token={token} onNewToken={save} />;
}

/** Hora del consultorio, al segundo. */
function useClock() {
  const [time, setTime] = useState(clinicTime);
  useEffect(() => {
    const timer = setInterval(() => setTime(clinicTime()), 1000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

function Board({ token, onNewToken }: { token: string; onNewToken: (token: string) => void }) {
  const sound = useCallAnnouncer();
  const { status, calls, freshKey, enabled } = useDisplayStream(
    token,
    sound.announce,
    (config) => sound.setRepeats(config.voiceRepeats),
  );
  const { clinicName } = useClinicSettings();
  const time = useClock();

  if (status === 'unauthorized') {
    return (
      <Setup
        onSave={onNewToken}
        problem="Esta pantalla ya no está autorizada. Pedile al administrador un token nuevo."
      />
    );
  }

  const [current, ...earlier] = calls;
  return (
    <main
      className={`grid h-dvh grid-rows-[auto_1fr] overflow-hidden bg-ink-deep text-paper select-none ${sound.enabled ? 'cursor-none' : ''}`}
    >
      <header className="flex items-center justify-between px-[4vw] pt-[3.5vh]">
        <div className="flex items-center gap-[1.2vw] text-[min(2.2vw,4vh)] font-semibold">
          <img src="/favicon.svg" alt="" className="size-[min(3vw,5.5vh)]" />
          {clinicName}
        </div>
        <div className="flex items-center gap-[2.2vw]">
          <SoundButton enabled={sound.enabled} onActivate={sound.activate} onMute={sound.mute} />
          <Connection status={status} />
          <span className="text-[min(3vw,5.5vh)] font-semibold tabular">
            {time.slice(0, 5)}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[1.75fr_1fr] gap-[3vw] px-[4vw] pt-[3vh] pb-[4.5vh]">
        <Current call={current} fresh={current?.key === freshKey} disabled={!enabled} />
        {enabled ? <Earlier calls={earlier} /> : <div />}
      </div>
      {sound.showVoiceWarning && <VoiceWarning status={sound.voiceStatus} />}
    </main>
  );
}

/**
 * El navegador no deja sonar nada hasta que alguien toca la página: hasta
 * entonces el botón es bien visible (ámbar) para quien instala la pantalla;
 * una vez activo queda discreto, y tocarlo de nuevo silencia.
 */
function SoundButton({
  enabled,
  onActivate,
  onMute,
}: {
  enabled: boolean;
  onActivate: () => void;
  onMute: () => void;
}) {
  return enabled ? (
    <button
      type="button"
      onClick={onMute}
      aria-label="Sonido activo. Tocá para silenciar"
      className="flex items-center gap-[0.8vw] text-[min(1.7vw,3.2vh)] text-paper/55"
    >
      <SpeakerWaveIcon aria-hidden className="size-[min(2vw,3.8vh)]" />
      Sonido activo
    </button>
  ) : (
    <button
      type="button"
      onClick={onActivate}
      autoFocus
      className="flex items-center gap-[0.8vw] rounded-[0.8vw] bg-signal px-[1.6vw] py-[1vh] text-[min(1.9vw,3.6vh)] font-bold text-ink-deep hover:brightness-110"
    >
      <SpeakerXMarkIcon aria-hidden className="size-[min(2.2vw,4vh)]" />
      Activar sonido
    </button>
  );
}

/** Aviso para quien instala la pantalla (se oculta solo): sin voz en español los nombres suenan mal. */
function VoiceWarning({ status }: { status: VoiceStatus }) {
  return (
    <p
      role="alert"
      className="fixed bottom-[1vh] left-1/2 w-[min(80vw,1400px)] -translate-x-1/2 rounded-[1vw] bg-signal px-[2vw] py-[0.9vh] text-center text-[min(1.8vw,3.4vh)] font-semibold text-ink-deep"
    >
      {status === 'none'
        ? 'Este televisor no puede decir los nombres en voz alta: solo se va a oír el timbre.'
        : 'Este televisor no tiene una voz en español: los nombres se van a leer con otra voz y pueden sonar mal. Instalá una voz en español en el sistema.'}
    </p>
  );
}

/** Solo se nota cuando algo anda mal: con conexión normal es un punto discreto. */
function Connection({ status }: { status: StreamStatus }) {
  const live = status === 'live';
  return (
    <span
      role="status"
      className={`flex items-center gap-[0.8vw] text-[min(1.7vw,3.2vh)] ${live ? 'text-paper/55' : 'font-semibold text-signal'}`}
    >
      <span
        aria-hidden
        className={`size-[min(1.1vw,2vh)] rounded-full ${live ? 'bg-eucalyptus-glow' : 'bg-signal'}`}
      />
      {live ? 'Conectado' : status === 'connecting' ? 'Conectando…' : 'Reconectando…'}
    </span>
  );
}

/** El tamaño del nombre baja con el largo para que nunca se corte ni pase de dos líneas. */
function nameSize(fullName: string): string {
  if (fullName.length > 34) return 'text-[min(4.6vw,9vh)]';
  if (fullName.length > 22) return 'text-[min(6vw,11.5vh)]';
  return 'text-[min(8vw,15vh)]';
}

/** Igual que el nombre: el consultorio baja de tamaño si el texto es largo. */
function officeSize(name: string): string {
  if (name.length > 24) return 'text-[min(3vw,6vh)]';
  if (name.length > 14) return 'text-[min(4vw,8vh)]';
  return 'text-[min(5vw,10vh)]';
}

function Current({
  call,
  fresh,
  disabled,
}: {
  call?: DisplayCall;
  fresh: boolean;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <section className="flex flex-col justify-center rounded-[1.4vw] bg-ink px-[4vw]">
        <h1 className="text-[min(5.2vw,10vh)] leading-[1.1] font-bold text-balance text-paper">
          Llamados desactivados
        </h1>
        <p className="mt-[2vh] max-w-[40ch] text-[min(2.6vw,5vh)] leading-snug text-paper/70">
          Por ahora los pacientes no se llaman por esta pantalla.
        </p>
      </section>
    );
  }
  if (!call) {
    return (
      <section className="flex flex-col justify-center rounded-[1.4vw] bg-ink px-[4vw]">
        <h1 className="text-[min(5.2vw,10vh)] leading-[1.1] font-bold text-balance text-paper">
          Todavía no hay llamados
        </h1>
        <p className="mt-[2vh] max-w-[40ch] text-[min(2.6vw,5vh)] leading-snug text-paper/70">
          Cuando el médico llame a un paciente, su nombre y el consultorio van a aparecer acá.
        </p>
      </section>
    );
  }

  const fullName = call.displayName;
  return (
    // key: un llamado nuevo es otro elemento, así la animación arranca de nuevo
    <section
      key={call.key}
      aria-live="polite"
      className={`flex min-h-0 flex-col justify-between rounded-[1.4vw] bg-ink px-[4vw] py-[4.5vh] ${fresh ? 'call-fresh' : ''}`}
    >
      <div>
        <div className="flex items-baseline justify-between gap-[2vw]">
          <p className="text-[min(2.8vw,5.4vh)] font-semibold text-eucalyptus-glow">
            {call.callNumber > 1 ? `Llamado ${call.callNumber}` : 'Llamando a'}
          </p>
          <p className="text-[min(2.6vw,5vh)] text-paper/70 tabular">
            {call.calledTime.slice(0, 5)}
          </p>
        </div>
        <h1 className={`mt-[1.5vh] leading-[1.05] font-bold text-balance text-paper ${nameSize(fullName)}`}>
          {fullName}
        </h1>
      </div>
      <p
        className={`w-fit max-w-full rounded-[1vw] bg-eucalyptus-glow px-[2.6vw] py-[1.8vh] leading-none font-bold text-balance text-ink-deep ${officeSize(call.officeName)}`}
      >
        {call.officeName}
      </p>
    </section>
  );
}

function Earlier({ calls }: { calls: DisplayCall[] }) {
  return (
    <section className="flex min-h-0 flex-col">
      <h2 className="mb-[2vh] text-[min(2.3vw,4.4vh)] font-semibold text-paper/70">
        Llamados anteriores
      </h2>
      {calls.length === 0 ? (
        <p className="text-[min(2.2vw,4.2vh)] text-paper/50">Todavía no hay anteriores.</p>
      ) : (
        <ol className="flex min-h-0 flex-col gap-[1.6vh] overflow-hidden">
          {calls.map((c) => (
            <li key={c.key} className="rounded-[1vw] bg-ink px-[1.8vw] py-[1.4vh]">
              <p className="line-clamp-2 text-[min(2.4vw,4.6vh)] leading-tight font-semibold text-balance">
                {c.displayName}
              </p>
              <p className="mt-[0.8vh] flex items-baseline justify-between gap-[1vw]">
                <span className="text-[min(2vw,3.8vh)] font-bold text-eucalyptus-glow">
                  {c.officeName}
                </span>
                <span className="text-[min(1.7vw,3.2vh)] text-paper/60 tabular">
                  {c.calledTime.slice(0, 5)}
                </span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Primera vez en este televisor (o token que ya no sirve): se pega el token una sola vez. */
function Setup({ onSave, problem }: { onSave: (token: string) => void; problem?: string }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(problem ?? null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const token = value.trim();
    if (!TOKEN_PATTERN.test(token)) {
      setError('El token no es válido. Copialo completo desde Administración.');
      return;
    }
    onSave(token);
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-ink-deep px-6 text-paper">
      <form onSubmit={submit} className="w-full max-w-xl rounded-(--radius-panel) bg-ink p-8">
        <h1 className="text-2xl font-bold text-paper">Configurar esta pantalla</h1>
        <p className="mt-2 text-paper/75">
          Pegá el token de pantalla que generó el administrador. Se guarda en este televisor y no
          hace falta volver a cargarlo.
        </p>
        <label htmlFor="display-token" className="mt-6 block font-medium">
          Token de pantalla
        </label>
        <input
          id="display-token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          className="mt-2 h-12 w-full rounded-(--radius-control) border border-paper/30 bg-ink-deep px-3 font-mono text-paper placeholder:text-paper/40"
          placeholder="dsp_…"
        />
        {error && (
          <p role="alert" className="mt-3 font-medium text-signal">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="mt-6 h-12 w-full rounded-(--radius-control) bg-eucalyptus-glow font-bold text-ink-deep hover:brightness-110"
        >
          Guardar y conectar
        </button>
      </form>
    </main>
  );
}
