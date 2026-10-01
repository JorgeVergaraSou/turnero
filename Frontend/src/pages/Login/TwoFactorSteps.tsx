import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  type Session,
  twoFactorEnableService,
  twoFactorSetupService,
  twoFactorVerifyService,
} from '@/services/auth.service';
import { Button, ErrorNotice, Spinner, TextInput } from '@/components/ui';
import { copyToClipboard, getErrorMessage } from '@/utilities';

/**
 * Segundo paso del login (verificación en dos pasos, app tipo Google
 * Authenticator). El challenge vence a los 10 minutos: si pasa eso, el
 * backend lo dice y se vuelve a la contraseña con "Volver".
 */

/** Ingresos siguientes: código de 6 dígitos o uno de recuperación. */
export function VerifyStep({
  challengeToken,
  onDone,
  onBack,
}: {
  challengeToken: string;
  onDone: (session: Session) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError(useRecovery ? 'Escribí un código de recuperación.' : 'Escribí el código de 6 dígitos.');
    setLoading(true);
    setError('');
    try {
      onDone(await twoFactorVerifyService(challengeToken, code));
    } catch (err) {
      setError(getErrorMessage(err));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
      <p className="text-ink-soft">
        {useRecovery
          ? 'Escribí uno de los códigos de recuperación que guardaste al configurar la verificación. Cada uno sirve una sola vez.'
          : 'Abrí la app de verificación en tu celular y escribí el código de 6 dígitos que muestra para este sistema.'}
      </p>
      {useRecovery ? (
        <TextInput
          key="recovery"
          label="Código de recuperación"
          autoComplete="off"
          autoFocus
          className="font-mono tracking-wider uppercase"
          placeholder="XXXXX-XXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      ) : (
        <TextInput
          key="totp"
          label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          className="font-mono text-xl tracking-[0.3em] tabular"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      )}
      {error && <ErrorNotice message={error} />}
      <Button type="submit" size="lg" loading={loading}>
        Verificar
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setUseRecovery(!useRecovery);
            setCode('');
            setError('');
          }}
          className="text-eucalyptus underline underline-offset-2"
        >
          {useRecovery ? 'Usar el código de la app' : 'No tengo el celular: usar un código de recuperación'}
        </button>
        <button type="button" onClick={onBack} className="text-ink-soft underline underline-offset-2">
          Volver
        </button>
      </div>
    </form>
  );
}

/** Primera vez: QR → primer código → códigos de recuperación. */
export function SetupStep({
  challengeToken,
  onDone,
  onBack,
}: {
  challengeToken: string;
  onDone: (session: Session) => void;
  onBack: () => void;
}) {
  const [qr, setQr] = useState<{ image: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState<{ session: Session; recoveryCodes: string[] } | null>(null);

  useEffect(() => {
    let current = true;
    twoFactorSetupService(challengeToken)
      .then(async ({ otpauthUrl, secret }) => {
        const image = await QRCode.toDataURL(otpauthUrl, { width: 220, margin: 1 });
        if (current) setQr({ image, secret });
      })
      .catch((err) => current && setError(getErrorMessage(err)));
    return () => {
      current = false;
    };
  }, [challengeToken]);

  if (enabled) {
    return <RecoveryCodesStep codes={enabled.recoveryCodes} onContinue={() => onDone(enabled.session)} />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError('Escribí el código de 6 dígitos que muestra la app.');
    setLoading(true);
    setError('');
    try {
      setEnabled(await twoFactorEnableService(challengeToken, code));
    } catch (err) {
      setError(getErrorMessage(err));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
      <p className="text-ink-soft">
        Por seguridad, tu cuenta necesita <strong className="text-ink">verificación en dos pasos</strong>: además de la
        contraseña, vas a escribir un código que cambia cada 30 segundos en tu celular. Se configura una sola vez.
      </p>
      <ol className="grid list-decimal gap-2 pl-5 text-[0.95rem]">
        <li>
          Instalá en tu celular <strong>Google Authenticator</strong> o <strong>Microsoft Authenticator</strong> (son
          gratis).
        </li>
        <li>En la app, tocá &quot;+&quot; y elegí escanear un código QR.</li>
        <li>Escribí abajo el código de 6 dígitos que aparece.</li>
      </ol>
      {!qr && !error && <Spinner />}
      {qr && (
        <div className="grid justify-items-center gap-2 rounded-(--radius-panel) border border-line bg-sheet p-4">
          <img src={qr.image} alt="Código QR para la app de verificación" className="size-[220px]" />
          <details className="text-center text-sm text-ink-soft">
            <summary className="cursor-pointer">¿No podés escanearlo? Cargá esta clave a mano</summary>
            <p className="mt-2 font-mono text-base break-all text-ink select-all">
              {qr.secret.match(/.{1,4}/g)?.join(' ')}
            </p>
          </details>
        </div>
      )}
      <TextInput
        label="Código de 6 dígitos"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="font-mono text-xl tracking-[0.3em] tabular"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      {error && <ErrorNotice message={error} />}
      <Button type="submit" size="lg" loading={loading} disabled={!qr}>
        Activar y entrar
      </Button>
      <button type="button" onClick={onBack} className="justify-self-start text-ink-soft underline underline-offset-2">
        Volver
      </button>
    </form>
  );
}

/** Se muestran UNA sola vez: el backend guarda solo las huellas. */
function RecoveryCodesStep({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-6 grid gap-4">
      <p className="font-medium text-st-confirmed">Listo: la verificación en dos pasos quedó activada.</p>
      <p className="text-ink-soft">
        Guardá estos <strong className="text-ink">códigos de recuperación</strong> en un lugar seguro (impresos o en tu
        gestor de contraseñas). Sirven para entrar si perdés o cambiás el celular. Cada uno se usa una sola vez y{' '}
        <strong className="text-ink">no se vuelven a mostrar</strong>.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-(--radius-panel) border border-line bg-sheet p-4 font-mono text-[1.05rem] tabular select-all">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button
          variant="secondary"
          onClick={async () => setCopied(await copyToClipboard(codes.join('\n')))}
        >
          {copied ? 'Copiados' : 'Copiar'}
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimir
        </Button>
      </div>
      <label className="flex items-start gap-3 print:hidden">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-eucalyptus"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        <span>Ya los guardé en un lugar seguro</span>
      </label>
      <Button size="lg" disabled={!saved} onClick={onContinue} className="print:hidden">
        Continuar
      </Button>
    </div>
  );
}
