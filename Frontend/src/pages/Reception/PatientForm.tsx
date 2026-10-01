import { useState } from 'react';
import type { Patient, PatientInput } from '@/interfaces';
import { receptionApi } from '@/services';
import { Button, ErrorNotice, Modal, TextInput } from '@/components/ui';
import { HealthInsuranceSelect } from '@/components/HealthInsuranceSelect';
import { useAsync } from '@/hooks/useAsync';
import { getErrorMessage } from '@/utilities';

/** Alta / edición de los datos ADMINISTRATIVOS de un paciente. */
export function PatientFormModal({
  open,
  patient,
  initialDocument = '',
  onClose,
  onSaved,
}: {
  open: boolean;
  patient?: Patient | null;
  initialDocument?: string;
  onClose: () => void;
  onSaved: (patient: Patient) => void;
}) {
  const [form, setForm] = useState<PatientInput>(() => ({
    firstName: patient?.firstName ?? '',
    lastName: patient?.lastName ?? '',
    documentNumber: patient?.documentNumber ?? initialDocument,
    phone: patient?.phone ?? '',
    email: patient?.email ?? '',
    birthDate: patient?.birthDate ?? '',
    // paciente nuevo: sin elegir (obligatorio); existente: la que tiene
    healthInsuranceId: patient ? patient.healthInsuranceId : undefined,
    healthInsuranceNumber: patient?.healthInsuranceNumber ?? '',
  }));
  const insurances = useAsync(() => receptionApi.healthInsurances(), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof PatientInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.healthInsuranceId === undefined) {
      setError('Elegí la obra social (o "Particular").');
      return;
    }
    setSaving(true);
    setError('');
    // los opcionales vacíos no se mandan (el backend valida formato si llegan)
    const body: PatientInput = {
      firstName: form.firstName,
      lastName: form.lastName,
      documentNumber: form.documentNumber,
      phone: form.phone,
      healthInsuranceId: form.healthInsuranceId,
      // null lo borra (y el backend lo borra igual si es particular)
      healthInsuranceNumber: (form.healthInsuranceId && form.healthInsuranceNumber?.trim()) || null,
      ...(form.email?.trim() && { email: form.email.trim() }),
      ...(form.birthDate && { birthDate: form.birthDate }),
    };
    try {
      const saved = patient
        ? await receptionApi.updatePatient(patient.id, body)
        : await receptionApi.createPatient(body);
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={patient ? 'Editar paciente' : 'Nuevo paciente'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="patient-form" loading={saving}>
            {patient ? 'Guardar cambios' : 'Crear paciente'}
          </Button>
        </>
      }
    >
      <form id="patient-form" onSubmit={save} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Nombre" required value={form.firstName} onChange={set('firstName')} />
          <TextInput label="Apellido" required value={form.lastName} onChange={set('lastName')} />
          <TextInput
            label="DNI"
            required
            className="font-mono tabular"
            value={form.documentNumber}
            onChange={set('documentNumber')}
          />
          <TextInput label="Fecha de nacimiento" type="date" value={form.birthDate ?? ''} onChange={set('birthDate')} />
          <TextInput label="Teléfono" type="tel" required value={form.phone} onChange={set('phone')} />
          <TextInput label="Email" type="email" value={form.email ?? ''} onChange={set('email')} />
          {insurances.error ? (
            <ErrorNotice message={insurances.error} onRetry={insurances.reload} />
          ) : (
            <HealthInsuranceSelect
              options={insurances.data ?? []}
              value={form.healthInsuranceId}
              onChange={(healthInsuranceId) => setForm({ ...form, healthInsuranceId })}
            />
          )}
          {form.healthInsuranceId ? (
            <TextInput
              label="Número de afiliado"
              className="font-mono tabular"
              value={form.healthInsuranceNumber ?? ''}
              onChange={set('healthInsuranceNumber')}
              hint="Opcional. Copialo de la credencial."
            />
          ) : (
            <div className="hidden sm:block" aria-hidden />
          )}
        </div>
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  );
}
