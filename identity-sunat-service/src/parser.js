/**
 * Parsea HTML/resultado de Consulta RUC SUNAT → JSON normalizado.
 */

function clean(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLabel(text, label) {
  const t = clean(text);
  const re = new RegExp(`^${label}\\s*:?\\s*`, 'i');
  return clean(t.replace(re, ''));
}

/**
 * @param {string} html
 * @param {'DNI'|'RUC'} tipo
 * @param {string} numero
 */
export function parseSunatHtml(html, tipo, numero) {
  const text = clean(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '));

  if (/NO REGISTRA un n[uú]mero de RUC/i.test(text) || /no registra un numero de ruc/i.test(text)) {
    return {
      encontrado: false,
      tipo_documento: tipo,
      numero_documento: numero,
      razon_social: '',
      mensaje: extractNegativo(html) || 'El Sistema RUC NO REGISTRA datos para el documento consultado.',
      fuente: 'sunat-consulta-ruc',
    };
  }

  if (/c[oó]digo mostrado|captcha|recaptcha/i.test(text) && /ingrese el c[oó]digo/i.test(text)) {
    const err = new Error('SUNAT requiere captcha');
    err.code = 'IDENTITY_CAPTCHA';
    throw err;
  }

  const fields = extractListGroupFields(html);
  const dniBlock = parseDniStyleResult(html);

  if (tipo === 'DNI' || dniBlock) {
    if (dniBlock) {
      return {
        encontrado: true,
        tipo_documento: tipo,
        numero_documento: numero,
        ruc: dniBlock.ruc || null,
        razon_social: dniBlock.nombre || '',
        direccion: dniBlock.ubicacion || null,
        estado_contribuyente: dniBlock.estado || fields['estado del contribuyente'] || null,
        condicion_contribuyente: fields['condición del contribuyente'] || fields['condicion del contribuyente'] || null,
        tipo_contribuyente: fields['tipo contribuyente'] || null,
        nombre_comercial: fields['nombre comercial'] || null,
        mensaje: null,
        fuente: 'sunat-consulta-ruc',
      };
    }
  }

  // RUC / ficha detallada
  const tipoContrib = fields['tipo contribuyente'] || null;
  const nombreComercial = fields['nombre comercial'] || null;
  const estado = fields['estado del contribuyente'] || null;
  const condicion = fields['condición del contribuyente'] || fields['condicion del contribuyente'] || null;
  const numeroRucRaw = fields['número de ruc'] || fields['numero de ruc'] || '';

  let ruc = null;
  let razon = '';
  const rucMatch = clean(numeroRucRaw).match(/^(\d{11})\s*[-–—]\s*(.+)$/);
  if (rucMatch) {
    ruc = rucMatch[1];
    razon = clean(rucMatch[2]);
  } else if (/^\d{11}$/.test(clean(numeroRucRaw))) {
    ruc = clean(numeroRucRaw);
  }

  if (!razon && nombreComercial) razon = nombreComercial;
  if (!razon) {
    // fallback: primer h4 largo que no sea label
    const h4s = [...html.matchAll(/<h4[^>]*class="[^"]*list-group-item-heading[^"]*"[^>]*>([\s\S]*?)<\/h4>/gi)].map(
      (m) => clean(m[1].replace(/<[^>]+>/g, ''))
    );
    const candidate = h4s.find((h) => h && !/:$/.test(h) && !/^(tipo|nombre|n[uú]mero|estado|condici)/i.test(h));
    if (candidate) {
      const m = candidate.match(/^(\d{11})\s*[-–—]\s*(.+)$/);
      if (m) {
        ruc = ruc || m[1];
        razon = m[2];
      } else if (!/^(ruc:)/i.test(candidate)) {
        razon = candidate;
      }
    }
  }

  if (!razon && !estado && !tipoContrib && Object.keys(fields).length === 0) {
    const err = new Error('No se pudo interpretar la respuesta SUNAT');
    err.code = 'IDENTITY_PARSE';
    throw err;
  }

  return {
    encontrado: true,
    tipo_documento: tipo,
    numero_documento: numero,
    ruc: ruc || (tipo === 'RUC' ? numero : null),
    razon_social: razon || '',
    nombre_comercial: nombreComercial,
    direccion: fields['domicilio fiscal'] || fields['ubicación'] || fields['ubicacion'] || null,
    estado_contribuyente: estado,
    condicion_contribuyente: condicion,
    tipo_contribuyente: tipoContrib,
    mensaje: null,
    fuente: 'sunat-consulta-ruc',
  };
}

function extractNegativo(html) {
  const m = html.match(/<strong[^>]*>([\s\S]*?NO REGISTRA[\s\S]*?)<\/strong>/i);
  if (m) return clean(m[1].replace(/<[^>]+>/g, ''));
  return null;
}

/** Resultado compacto DNI: RUC + nombre + ubicación + estado */
function parseDniStyleResult(html) {
  const headings = [...html.matchAll(/<h4[^>]*class="[^"]*list-group-item-heading[^"]*"[^>]*>([\s\S]*?)<\/h4>/gi)].map(
    (m) => clean(m[1].replace(/<[^>]+>/g, ''))
  );
  const rucHeading = headings.find((h) => /^RUC:\s*\d{11}/i.test(h));
  if (!rucHeading) return null;

  const ruc = rucHeading.match(/(\d{11})/)?.[1] || null;
  const idx = headings.indexOf(rucHeading);
  const nombre = headings[idx + 1] && !/^RUC:/i.test(headings[idx + 1]) ? headings[idx + 1] : '';

  const ubicacionMatch = html.match(/Ubicaci[oó]n:\s*([^<]+)/i);
  const estadoMatch = html.match(/Estado:\s*(?:<[^>]+>)*\s*<strong[^>]*>\s*<span[^>]*>\s*([^<]+)/i)
    || html.match(/Estado:\s*(?:<[^>]+>)*\s*([^<\s]+)/i);

  return {
    ruc,
    nombre: clean(nombre),
    ubicacion: ubicacionMatch ? clean(ubicacionMatch[1]) : null,
    estado: estadoMatch ? clean(estadoMatch[1]) : null,
  };
}

function extractListGroupFields(html) {
  const fields = {};
  const items = html.match(/<div class="list-group-item[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi) || [];

  // Fallback más permisivo: pares heading/texto
  const rows = html.matchAll(
    /list-group-item-heading[^>]*>([\s\S]*?)<\/h4>[\s\S]*?list-group-item-text[^>]*>([\s\S]*?)<\/p>/gi
  );
  for (const m of rows) {
    const label = clean(m[1].replace(/<[^>]+>/g, '')).replace(/:$/, '').toLowerCase();
    const value = clean(m[2].replace(/<[^>]+>/g, ''));
    if (label && value) fields[label] = value;
  }

  // Duplicar sin acentos
  for (const [k, v] of Object.entries({ ...fields })) {
    const ascii = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!fields[ascii]) fields[ascii] = v;
  }

  void items;
  return fields;
}

export { clean, stripLabel };
