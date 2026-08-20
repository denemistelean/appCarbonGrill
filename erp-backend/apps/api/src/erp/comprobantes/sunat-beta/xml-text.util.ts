/**
 * Texto seguro para UBL SUNAT (encoding declarado ISO-8859-1).
 * El ZIP debe enviarse en bytes Latin-1, no UTF-8.
 */
export function esc(v: unknown): string {
  const s = toLatin1Safe(String(v ?? ''));
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Reemplaza caracteres no representables en ISO-8859-1 (conserva Á, Ñ, etc.). */
export function toLatin1Safe(text: string): string {
  return [...text].map((ch) => (ch.charCodeAt(0) <= 0xff ? ch : '?')).join('');
}

/** Convierte XML firmado a bytes ISO-8859-1 (sin alterar el contenido ya firmado). */
export function xmlToLatin1Buffer(xml: string): Buffer {
  return Buffer.from(xml, 'latin1');
}
