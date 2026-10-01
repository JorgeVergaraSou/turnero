import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Red de seguridad para errores de render no atrapados por ningún
 * componente de más abajo. Sin esto, un error sin manejar deja al usuario
 * con una pantalla en blanco sin ninguna explicación.
 *
 * Tiene que ser un componente de clase: React todavía no tiene equivalente
 * en hooks para getDerivedStateFromError/componentDidCatch.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error no manejado:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        // Sin router ni store: esta pantalla tiene que andar aunque eso falle,
        // por eso usa <a href> y window.location en vez de navegación de la app.
        <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
          <section
            role="alert"
            className="w-full max-w-md rounded-(--radius-panel) border border-line bg-sheet p-8 text-center shadow-[0_10px_24px_rgb(23_48_79/0.08)]"
          >
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-st-attention-wash text-st-attention">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold">Algo salió mal</h1>
            <p className="mt-2 text-ink-soft">
              Ocurrió un error inesperado y no pudimos mostrar esta pantalla.
              Tus datos están a salvo. Probá recargar la página; si el problema
              sigue, volvé al inicio.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              <a
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-(--radius-control) border border-line px-4 font-medium text-ink hover:bg-paper"
              >
                Ir al inicio
              </a>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-10 items-center justify-center rounded-(--radius-control) bg-eucalyptus px-4 font-medium text-white hover:bg-eucalyptus-dark"
              >
                Recargar la página
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
