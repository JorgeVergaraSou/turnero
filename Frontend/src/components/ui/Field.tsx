import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

/** Clase compartida por inputs, selects y textareas. */
export const controlClass =
  'w-full rounded-(--radius-control) border border-line bg-sheet px-3 text-ink placeholder:text-ink-faint hover:border-ink-faint focus:border-eucalyptus disabled:bg-paper disabled:text-ink-faint aria-invalid:border-st-cancelled';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/** Etiqueta + control + ayuda/error, conectados con id/aria-describedby. */
export function Field({ label, hint, error, className = '', children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, describedBy: note ? noteId : undefined, invalid: !!error })}
      {note && (
        <p id={noteId} className={`text-sm ${error ? 'text-st-cancelled' : 'text-ink-soft'}`}>
          {note}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { label, hint, error, wrapperClassName, className = '', ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${controlClass} h-11 ${className}`}
          {...props}
        />
      )}
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

export function SelectInput({
  label,
  hint,
  error,
  wrapperClassName,
  className = '',
  children,
  ...props
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${controlClass} h-11 ${className}`}
          {...props}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

export function TextArea({
  label,
  hint,
  error,
  wrapperClassName,
  className = '',
  rows = 3,
  ...props
}: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${controlClass} py-2 leading-relaxed ${className}`}
          {...props}
        />
      )}
    </Field>
  );
}

type SearchInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
  /** true mientras hay una búsqueda en curso (muestra el indicador) */
  searching?: boolean;
};

/**
 * Buscador en vivo: los resultados se actualizan mientras se escribe (la
 * pantalla debouncea con useDebouncedValue). Lupa a la izquierda,
 * indicador de "buscando" y botón para borrar a la derecha; Escape borra.
 */
export function SearchInput({
  label,
  hint = 'Los resultados aparecen mientras escribís.',
  error,
  wrapperClassName,
  className = '',
  value,
  onChange,
  searching = false,
  onKeyDown,
  ...props
}: SearchInputProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            id={id}
            type="search"
            role="searchbox"
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            aria-busy={searching || undefined}
            className={`${controlClass} h-11 pr-16 pl-10 [&::-webkit-search-cancel-button]:appearance-none ${className}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && value) {
                e.preventDefault();
                onChange('');
              }
              onKeyDown?.(e);
            }}
            {...props}
          />
          <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
            {searching && (
              <span
                className="size-4 animate-spin rounded-full border-2 border-line border-t-eucalyptus"
                role="status"
                aria-label="Buscando"
              />
            )}
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="rounded-(--radius-control) p-1 text-ink-faint hover:bg-paper hover:text-ink"
                aria-label="Borrar búsqueda"
              >
                <XMarkIcon className="size-4" aria-hidden />
              </button>
            )}
          </span>
        </div>
      )}
    </Field>
  );
}
