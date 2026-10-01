/**
 * Copia texto al portapapeles. `navigator.clipboard` solo existe en
 * contextos seguros (https o localhost); si el sistema se abre por http
 * desde otra máquina de la red, se usa el mecanismo viejo (textarea +
 * execCommand) para que el botón "Copiar" funcione igual.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // sigue con el mecanismo alternativo
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
