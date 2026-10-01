import type { DisplayCall } from '@/interfaces';

/** Veces que se dice cada llamado mientras el servidor no mande otra cosa. */
export const DEFAULT_VOICE_REPEATS = 2;

const PAUSE_BETWEEN_REPEATS_MS = 900;
/** Si llegan más llamados que esto mientras suena uno, se descartan los más viejos. */
const MAX_QUEUE = 6;
const CHIME_MS = 1100;

export type VoiceStatus = 'spanish' | 'other' | 'none';

/** Lo que se dice: el nombre ya formateado por el servidor y el consultorio. Nada más. */
export function announcementText(call: DisplayCall): string {
  return `${call.spokenName}, ${call.officeName}.`;
}

/**
 * Mejor voz en español disponible: primero rioplatense, después el resto de
 * las latinoamericanas y por último cualquier español. Las voces dependen
 * del navegador y del sistema operativo del televisor: puede no haber ninguna.
 */
export function pickSpanishVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const rank = (voice: SpeechSynthesisVoice): number => {
    const lang = voice.lang.replace('_', '-').toLowerCase();
    if (lang === 'es-ar') return 0;
    if (['es-419', 'es-mx', 'es-us', 'es-cl', 'es-uy', 'es-co'].includes(lang)) return 1;
    if (lang.startsWith('es')) return 2;
    return 99;
  };
  const best = [...voices].sort((a, b) => rank(a) - rank(b))[0];
  return best && rank(best) < 99 ? best : null;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type AudioContextConstructor = typeof AudioContext;

/**
 * Anuncia los llamados: un timbre corto y después la voz, repetida. Los
 * llamados se encolan (nunca se pisan ni se pierden uno a otro).
 *
 * El navegador bloquea el sonido hasta que alguien toca la página: por eso
 * hay que llamar a `activate()` desde un clic/tecla (botón "Activar sonido").
 * Mientras no esté activado, `enqueue` no hace nada.
 */
export class CallAnnouncer {
  private context: AudioContext | null = null;
  private queue: DisplayCall[] = [];
  private running = false;
  private active = false;
  private repeats = DEFAULT_VOICE_REPEATS;

  /** Cuántas veces se dice cada llamado (lo define el administrador en Configuración). */
  setRepeats(repeats: number): void {
    this.repeats = Math.min(3, Math.max(1, Math.round(repeats)));
  }

  get speechSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  voiceStatus(): VoiceStatus {
    if (!this.speechSupported) return 'none';
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return 'none';
    return pickSpanishVoice(voices) ? 'spanish' : 'other';
  }

  /** Desde un gesto del usuario: habilita el audio y confirma con un timbre y una frase. */
  activate(): void {
    this.active = true;
    if (!this.context) {
      const Ctor: AudioContextConstructor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
      if (Ctor) this.context = new Ctor();
    }
    void this.context?.resume();
    void this.confirm();
  }

  /** Silencia y corta lo que esté sonando. */
  deactivate(): void {
    this.active = false;
    this.queue = [];
    if (this.speechSupported) window.speechSynthesis.cancel();
  }

  enqueue(call: DisplayCall): void {
    if (!this.active) return;
    this.queue.push(call);
    while (this.queue.length > MAX_QUEUE) this.queue.shift();
    void this.drain();
  }

  private async confirm(): Promise<void> {
    await this.chime();
    await this.speak('Sonido activado.');
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.active && this.queue.length > 0) {
        const call = this.queue.shift()!;
        await this.chime();
        for (let i = 0; i < this.repeats && this.active; i++) {
          if (i > 0) await wait(PAUSE_BETWEEN_REPEATS_MS);
          await this.speak(announcementText(call));
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Dos notas descendentes ("din-don") sintetizadas: no necesita ningún archivo de audio. */
  private async chime(): Promise<void> {
    const context = this.context;
    if (!context || context.state === 'closed') return;
    try {
      const start = context.currentTime;
      [
        [880, 0],
        [659.25, 0.3],
      ].forEach(([frequency, offset]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.4, start + offset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.8);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.85);
      });
    } catch {
      // sin timbre: la voz igual se dice
    }
    await wait(CHIME_MS);
  }

  /** Dice un texto y espera a que termine (con tope: algunos televisores nunca avisan el fin). */
  private speak(text: string): Promise<void> {
    if (!this.speechSupported) return Promise.resolve();
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickSpanishVoice(window.speechSynthesis.getVoices());
      utterance.lang = voice?.lang ?? 'es-AR';
      if (voice) utterance.voice = voice;
      utterance.rate = 0.9; // un poco más lento: se entiende mejor a distancia
      utterance.volume = 1;
      const timer = setTimeout(resolve, 4000 + text.length * 130);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    });
  }
}
