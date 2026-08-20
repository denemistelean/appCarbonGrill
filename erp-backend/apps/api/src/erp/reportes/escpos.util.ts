export function construirEscPos80(lineas: string[]): Buffer {
  const chunks: Buffer[] = [];
  chunks.push(Buffer.from([0x1b, 0x40]));
  chunks.push(Buffer.from([0x1b, 0x61, 0x00]));
  chunks.push(Buffer.from([0x1d, 0x21, 0x00]));
  for (const raw of lineas) {
    const line = asciiTicket(raw).slice(0, 42);
    chunks.push(Buffer.from(`${line}\n`, 'ascii'));
  }
  chunks.push(Buffer.from('\n\n'));
  chunks.push(Buffer.from([0x1d, 0x56, 0x00]));
  return Buffer.concat(chunks);
}

export function asciiTicket(s: string) {
  return String(s ?? '')
    .replace(/[áàäâ]/gi, 'a')
    .replace(/[éèëê]/gi, 'e')
    .replace(/[íìïî]/gi, 'i')
    .replace(/[óòöô]/gi, 'o')
    .replace(/[úùüû]/gi, 'u')
    .replace(/ñ/gi, 'n')
    .replace(/[^\x20-\x7E]/g, ' ');
}
