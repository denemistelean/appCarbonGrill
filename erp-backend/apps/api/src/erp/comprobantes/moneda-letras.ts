const UNIDADES = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
];
const DECENAS = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function menorMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  if (n < 21) return UNIDADES[n];
  if (n < 30) return n === 20 ? 'VEINTE' : `VEINTI${UNIDADES[n - 20]}`;
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  const rest = n % 100;
  let out = c ? CENTENAS[c] + (rest ? ' ' : '') : '';
  if (rest < 21) out += UNIDADES[rest];
  else if (rest < 30) out += rest === 20 ? 'VEINTE' : `VEINTI${UNIDADES[u]}`;
  else out += `${DECENAS[d]}${u ? ` Y ${UNIDADES[u]}` : ''}`;
  return out.trim();
}

function enteroALetras(n: number): string {
  if (n === 0) return 'CERO';
  if (n < 1000) return menorMil(n);
  if (n < 1000000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const milesTxt = miles === 1 ? 'MIL' : `${menorMil(miles)} MIL`;
    return `${milesTxt}${resto ? ` ${menorMil(resto)}` : ''}`.trim();
  }
  const millones = Math.floor(n / 1000000);
  const resto = n % 1000000;
  const millTxt = millones === 1 ? 'UN MILLON' : `${menorMil(millones)} MILLONES`;
  return `${millTxt}${resto ? ` ${enteroALetras(resto)}` : ''}`.trim();
}

/** Ej: SON OCHOCIENTOS OCHENTA CON 00/100 SOLES */
export function montoEnLetrasSoles(monto: number): string {
  const n = Math.round((Number(monto) || 0) * 100) / 100;
  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  return `SON ${enteroALetras(entero)} CON ${String(centavos).padStart(2, '0')}/100 SOLES`;
}
