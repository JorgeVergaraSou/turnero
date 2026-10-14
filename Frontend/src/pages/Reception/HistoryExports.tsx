import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Swal from 'sweetalert2';
import { AppStore } from '@/redux/store';
import { Roles } from '@/models';
import { historyExportApi, receptionApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { HistoryExport, HistoryExportScope, Patient, RequesterType } from '@/interfaces';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  SelectInput,
  Spinner,
  TextInput,
} from '@/components/ui';
import { HistoryExportDue, HistoryExportStatusBadge } from '@/components/HistoryExportParts';
import { dateTime, getErrorMessage, showError, showSuccess } from '@/utilities';

/**
 * Pedidos de copia de la historia clínica (art. 14, Ley 26.529: se entrega
 * dentro de las 48 h). Recepción registra el pedido y lo sigue; administración
 * ve el estado y puede reasignar el médico. Acá no hay nada clínico: la copia
 * la genera el médico desde su panel.
 */
export function ReceptionHistoryExportsPage() {
  const role = useSelector((state: AppStore) => state.user.role);
  const canRequest = role === Roles.RECEPCIONISTA;
  const canReassign = role === Roles.ADMIN;

  const [scope, setScope] = useState<HistoryExportScope>('open');
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [reassigning, setReassigning] = useState<HistoryExport | null>(null);
  const list = useAsync(() => historyExportApi.list(scope), [scope]);

  // viene de "Copia de historia" en Pacientes: abre el alta con el paciente elegido
  const patientId = Number(params.get('paciente')) || null;
  const preselected = useAsync(() => receptionApi.patient(patientId!), [patientId], !!patientId && canRequest);
  const showCreate = canRequest && (creating || (!!patientId && !!preselected.data));

  const closeCreate = () => {
    setCreating(false);
    if (patientId) setParams({}, { replace: true });
  };

  const cancel = async (item: HistoryExport) => {
    const result = await Swal.fire({
      icon: 'question',
      title: 'Cancelar el pedido',
      text: `Pedido de ${item.patient.lastName}, ${item.patient.firstName}. Indicá por qué se cancela (no escribas datos clínicos).`,
      input: 'text',
      inputAttributes: { maxlength: '255' },
      showCancelButton: true,
      confirmButtonText: 'Cancelar el pedido',
      cancelButtonText: 'Volver',
      inputValidator: (value) => (value.trim() ? undefined : 'Indicá el motivo.'),
    });
    if (!result.isConfirmed) return;
    try {
      await historyExportApi.cancel(item.id, result.value.trim());
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err), 'No se pudo cancelar el pedido');
    }
  };

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Copias de historia clínica"
        description="El paciente puede pedir una copia de su historia clínica y se le entrega dentro de las 48 horas. Acá se registra el pedido y se sigue el plazo; la copia la genera el médico."
        actions={canRequest && <Button onClick={() => setCreating(true)}>Nuevo pedido</Button>}
      />

      <div className="mb-4 flex gap-2" role="group" aria-label="Qué pedidos mostrar">
        {(['open', 'all'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={scope === value ? 'primary' : 'secondary'}
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
          >
            {value === 'open' ? 'En curso' : 'Todos'}
          </Button>
        ))}
      </div>

      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState
          title={scope === 'open' ? 'No hay pedidos en curso' : 'Todavía no se registró ningún pedido'}
          action={canRequest ? <Button onClick={() => setCreating(true)}>Registrar un pedido</Button> : undefined}
        />
      ) : (
        <Panel className={`overflow-x-auto transition-opacity ${list.loading ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[48rem] text-left">
            <thead className="border-b border-line text-sm text-ink-soft">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Paciente</th>
                <th scope="col" className="px-4 py-3 font-medium">Pidió</th>
                <th scope="col" className="px-4 py-3 font-medium">Médico</th>
                <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                <th scope="col" className="px-4 py-3 font-medium">Plazo</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {list.data.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {item.patient.lastName}, {item.patient.firstName}
                    </span>
                    <span className="block font-mono text-sm text-ink-soft tabular">{item.patient.documentNumber}</span>
                  </td>
                  <td className="px-4 py-3">
                    {item.requesterType === 'TITULAR' ? (
                      'El paciente'
                    ) : (
                      <>
                        {item.requesterName}
                        <span className="block text-sm text-ink-soft">
                          {item.requesterRelationship}, documento {item.requesterDocument}
                        </span>
                      </>
                    )}
                    <span className="block text-sm text-ink-faint">{dateTime(item.requestedAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {item.professional.lastName}, {item.professional.firstName}
                  </td>
                  <td className="px-4 py-3">
                    <HistoryExportStatusBadge item={item} />
                    {item.status === 'CANCELADA' && item.cancelReason && (
                      <span className="mt-1 block text-sm text-ink-soft">{item.cancelReason}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <HistoryExportDue item={item} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {item.status === 'PENDIENTE' && canReassign && (
                        <Button size="sm" variant="secondary" onClick={() => setReassigning(item)}>
                          Cambiar médico
                        </Button>
                      )}
                      {item.status === 'PENDIENTE' && canRequest && (
                        <Button size="sm" variant="ghost" onClick={() => cancel(item)}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {showCreate && (
        <NewRequestModal
          initialPatient={preselected.data ?? null}
          onClose={closeCreate}
          onCreated={() => {
            closeCreate();
            setScope('open');
            list.reload();
          }}
        />
      )}
      {reassigning && (
        <ReassignModal
          item={reassigning}
          onClose={() => setReassigning(null)}
          onDone={() => {
            setReassigning(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function NewRequestModal({
  initialPatient,
  onClose,
  onCreated,
}: {
  initialPatient: Patient | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [patient, setPatient] = useState<Patient | null>(initialPatient);
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim());
  const found = useAsync(() => receptionApi.searchPatients(term, 1), [term], !patient && term.length >= 2);
  const candidates = useAsync(() => historyExportApi.candidates(patient!.id), [patient?.id], !!patient);

  const [professionalId, setProfessionalId] = useState('');
  const [requesterType, setRequesterType] = useState<RequesterType>('TITULAR');
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [relationship, setRelationship] = useState('');
  const [identityChecked, setIdentityChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const options = candidates.data ?? [];
  // por defecto, el médico de la atención más reciente (el backend los devuelve en ese orden)
  const selectedProfessional = professionalId || (options[0] ? String(options[0].id) : '');
  const isRep = requesterType === 'REPRESENTANTE';
  const ready =
    !!patient &&
    !!selectedProfessional &&
    identityChecked &&
    (!isRep || (name.trim() && document.trim() && relationship.trim()));

  const submit = async () => {
    if (!patient || !ready) return;
    setSaving(true);
    setError('');
    try {
      const created = await historyExportApi.create({
        patientId: patient.id,
        assignedProfessionalId: Number(selectedProfessional),
        requesterType,
        ...(isRep
          ? {
              requesterName: name.trim(),
              requesterDocument: document.trim(),
              requesterRelationship: relationship.trim(),
            }
          : {}),
        identityChecked,
      });
      await showSuccess('Pedido registrado', `La copia tiene que estar lista antes del ${dateTime(created.dueAt)}.`);
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo pedido de copia"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving} disabled={!ready}>
            Registrar el pedido
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {!patient ? (
          <div>
            <SearchInput
              label="Paciente"
              hint="Buscá por DNI, nombre o apellido."
              value={q}
              onChange={setQ}
              searching={found.loading}
            />
            {found.data && (
              <ul className="mt-3 divide-y divide-line-soft rounded-(--radius-control) border border-line">
                {found.data.items.length === 0 && <li className="px-3 py-3 text-ink-soft">No hay pacientes que coincidan.</li>}
                {found.data.items.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPatient(p)}
                      className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-line-soft/60"
                    >
                      <span className="font-medium">
                        {p.lastName}, {p.firstName}
                      </span>
                      <span className="font-mono text-sm text-ink-soft tabular">{p.documentNumber}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex items-baseline justify-between gap-3 rounded-(--radius-control) bg-paper px-3 py-2.5">
            <div>
              <p className="font-medium">
                {patient.lastName}, {patient.firstName}
              </p>
              <p className="font-mono text-sm text-ink-soft tabular">DNI {patient.documentNumber}</p>
            </div>
            {!initialPatient && (
              <Button size="sm" variant="ghost" onClick={() => setPatient(null)}>
                Cambiar
              </Button>
            )}
          </div>
        )}

        {patient &&
          (candidates.loading ? (
            <Spinner />
          ) : candidates.error ? (
            <ErrorNotice message={candidates.error} onRetry={candidates.reload} />
          ) : options.length === 0 ? (
            <Notice>
              Este paciente no tuvo turnos con ningún médico, así que todavía no tiene historia clínica para copiar.
            </Notice>
          ) : (
            <SelectInput
              label="Médico que entrega la copia"
              hint="Solo aparecen los médicos que atendieron al paciente. El primero es el de la atención más reciente."
              value={selectedProfessional}
              onChange={(e) => setProfessionalId(e.target.value)}
            >
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                  {p.specialties.length ? ` (${p.specialties.join(', ')})` : ''}
                </option>
              ))}
            </SelectInput>
          ))}

        {patient && options.length > 0 && (
          <>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Quién pide la copia</legend>
              {(
                [
                  ['TITULAR', 'El propio paciente'],
                  ['REPRESENTANTE', 'Un representante legal (por ejemplo, madre, padre o tutor)'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="requester"
                    className="mt-1 size-4 accent-eucalyptus"
                    checked={requesterType === value}
                    onChange={() => setRequesterType(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            {isRep && (
              <div className="grid gap-4">
                <TextInput label="Nombre y apellido de quien retira" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
                <TextInput label="Documento" value={document} maxLength={20} onChange={(e) => setDocument(e.target.value)} />
                <TextInput
                  label="Vínculo con el paciente"
                  hint="Por ejemplo: madre, padre, tutor."
                  value={relationship}
                  maxLength={60}
                  onChange={(e) => setRelationship(e.target.value)}
                />
                <Notice>
                  Si no es el propio paciente, verificá que esté autorizado a retirar la copia. Cómo se acredita la
                  representación lo define el consultorio con su asesor legal.
                </Notice>
              </div>
            )}

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-eucalyptus"
                checked={identityChecked}
                onChange={(e) => setIdentityChecked(e.target.checked)}
              />
              <span>
                <span className="font-medium">Verifiqué el DNI de quien pide la copia</span>
                <span className="block text-sm text-ink-soft">
                  Es obligatorio. El médico vuelve a confirmar la identidad cuando la entrega.
                </span>
              </span>
            </label>
          </>
        )}

        {error && <ErrorNotice message={error} />}
      </div>
    </Modal>
  );
}

function ReassignModal({
  item,
  onClose,
  onDone,
}: {
  item: HistoryExport;
  onClose: () => void;
  onDone: () => void;
}) {
  const candidates = useAsync(() => historyExportApi.candidates(item.patient.id), [item.patient.id]);
  const options = (candidates.data ?? []).filter((p) => p.id !== item.professional.id);
  const [professionalId, setProfessionalId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = professionalId || (options[0] ? String(options[0].id) : '');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await historyExportApi.reassign(item.id, Number(selected));
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Cambiar el médico del pedido"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving} disabled={!selected}>
            Reasignar
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-ink-soft">
          Pedido de {item.patient.lastName}, {item.patient.firstName}. Hoy lo tiene {item.professional.lastName},{' '}
          {item.professional.firstName}.
        </p>
        {candidates.loading ? (
          <Spinner />
        ) : candidates.error ? (
          <ErrorNotice message={candidates.error} onRetry={candidates.reload} />
        ) : options.length === 0 ? (
          <Notice>No hay otro médico activo que haya atendido a este paciente.</Notice>
        ) : (
          <SelectInput label="Nuevo médico" value={selected} onChange={(e) => setProfessionalId(e.target.value)}>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.lastName}, {p.firstName}
              </option>
            ))}
          </SelectInput>
        )}
        {error && <ErrorNotice message={error} />}
      </div>
    </Modal>
  );
}

export default ReceptionHistoryExportsPage;
