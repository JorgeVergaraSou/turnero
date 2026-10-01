import type { HealthInsurance } from '@/interfaces';
import { SelectInput } from '@/components/ui';

/** valor del <select>: '' = sin elegir, 'particular' = null, si no el id */
const PARTICULAR = 'particular';

const toOption = (value: number | null | undefined) =>
  value === undefined ? '' : value === null ? PARTICULAR : String(value);

/**
 * Obra social: las del catálogo más "Particular (sin obra social)", que se
 * guarda como null. Sin elegir (undefined) el backend rechaza el pedido,
 * así que el formulario la trata como obligatoria.
 *
 * Si el valor actual es una obra social que ya no se atiende (legajo
 * viejo), se muestra igual para no perder el dato al editar.
 */
export function HealthInsuranceSelect({
  options,
  value,
  onChange,
  label = 'Obra social',
  hint,
  error,
  wrapperClassName,
}: {
  options: HealthInsurance[];
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}) {
  const visible = options.filter((o) => o.active !== false || o.id === value);
  return (
    <SelectInput
      label={label}
      hint={hint}
      error={error}
      wrapperClassName={wrapperClassName}
      value={toOption(value)}
      onChange={(e) =>
        onChange(e.target.value === PARTICULAR ? null : Number(e.target.value))
      }
    >
      <option value="" disabled>
        Elegí una opción
      </option>
      <option value={PARTICULAR}>Particular (sin obra social)</option>
      {visible.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
          {o.active === false ? ' (ya no se atiende)' : ''}
        </option>
      ))}
    </SelectInput>
  );
}
