import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/**
 * Content-Security-Policy del build de producción (meta tag). El token de
 * sesión vive en localStorage, así que la defensa principal contra XSS es
 * que un script inyectado no pueda ejecutarse ni mandar datos afuera:
 * - script-src 'self': solo los bundles propios (nada inline, nada externo);
 * - connect-src: solo la API (VITE_API_BASE_URL) — el token no puede
 *   exfiltrarse a otro dominio vía fetch/XHR;
 * - style-src 'unsafe-inline': SweetAlert2 inyecta sus estilos en un
 *   <style>; el riesgo de CSS inline es bajo comparado con el de scripts.
 *
 * Solo en build: en desarrollo Vite inyecta scripts inline (HMR) que una
 * CSP estricta rompería. `frame-ancestors` no funciona en meta: si el
 * frontend se sirve detrás de un servidor web, configurarla ahí como header
 * (junto con X-Frame-Options) para evitar clickjacking.
 */
function contentSecurityPolicy(apiBaseUrl: string): Plugin {
  const apiOrigin = new URL(apiBaseUrl).origin;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: ${apiOrigin}`,
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      ),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_API_BASE_URL)],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  };
});
