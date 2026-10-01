import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-eucalyptus text-white hover:bg-eucalyptus-dark disabled:bg-ink-faint',
  secondary:
    'bg-sheet text-ink border border-line hover:border-ink-soft disabled:text-ink-faint',
  ghost: 'text-ink hover:bg-line-soft disabled:text-ink-faint',
  danger:
    'bg-sheet text-st-cancelled border border-st-cancelled/40 hover:bg-st-cancelled-wash disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4',
  lg: 'h-12 px-6 text-lg',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/**
 * Botón base de toda la app. `type` es "button" por defecto (el default
 * del HTML es "submit"). `loading` lo deshabilita y avisa a lectores de
 * pantalla con aria-busy.
 */
export function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-(--radius-control) font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

export default Button;
