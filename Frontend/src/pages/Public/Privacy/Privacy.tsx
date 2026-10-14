import { publicApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { ErrorNotice, Notice, Spinner } from '@/components/ui';
import { dateTime } from '@/utilities';

/**
 * Política de privacidad vigente (página pública). El texto lo administra el
 * consultorio desde Configuración; acá solo se muestra, como texto (nunca
 * como HTML). Cada título numerado ("1. Responsable…") se resalta.
 */
export function PrivacyPage() {
  const notice = useAsync(() => publicApi.privacyNotice(), []);

  if (notice.loading) return <Spinner />;
  if (notice.error || !notice.data) return <ErrorNotice message={notice.error} onRetry={notice.reload} />;

  const { version, policy, draft, publishedAt } = notice.data;
  const sections = policy.split(/\n{2,}/).map((block) => {
    const [first, ...rest] = block.split('\n');
    const isTitle = /^\d+\.\s/.test(first) && rest.length > 0;
    return isTitle ? { title: first, body: rest.join('\n') } : { title: null, body: block };
  });

  return (
    <article>
      <h1 className="text-[2rem] font-bold sm:text-[2.5rem]">Política de privacidad</h1>
      <p className="mt-2 text-ink-soft">
        Versión {version}, publicada el {dateTime(publishedAt)}.
      </p>
      {draft && (
        <div className="mt-5">
          <Notice>Este texto está en revisión y puede cambiar.</Notice>
        </div>
      )}
      <div className="mt-6 grid max-w-prose gap-5">
        {sections.map((s, i) => (
          <section key={i}>
            {s.title && <h2 className="text-lg font-bold">{s.title}</h2>}
            <p className={`whitespace-pre-line text-ink-soft ${s.title ? 'mt-1.5' : ''}`}>{s.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}

export default PrivacyPage;
