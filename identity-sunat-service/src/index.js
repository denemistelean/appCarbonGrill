import express from 'express';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMutexQueue } from './queue.js';
import { consultarSunat, closeBrowser } from './sunat-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, '../.env'));

const PORT = Number(process.env.PORT || 3780);
const TIMEOUT_MS = Math.max(20000, Number(process.env.TIMEOUT_MS || 45000));
const HEADLESS = String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false';
const SUNAT_URL =
  process.env.SUNAT_URL ||
  'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp';

const enqueue = createMutexQueue();
const app = express();
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'identity-sunat-service', headless: HEADLESS, timeoutMs: TIMEOUT_MS });
});

app.get('/consultar', async (req, res) => {
  try {
    const result = await handleConsulta(req.query.tipo, req.query.numero);
    res.json(result);
  } catch (e) {
    sendError(res, e);
  }
});

app.post('/consultar', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await handleConsulta(body.tipo, body.numero);
    res.json(result);
  } catch (e) {
    sendError(res, e);
  }
});

async function handleConsulta(tipoRaw, numeroRaw) {
  const tipo = String(tipoRaw || '').trim().toUpperCase();
  const numero = String(numeroRaw || '').replace(/\D/g, '');

  if (tipo !== 'DNI' && tipo !== 'RUC') {
    const err = new Error('tipo debe ser DNI o RUC');
    err.status = 400;
    throw err;
  }
  if (tipo === 'DNI' && !/^\d{8}$/.test(numero)) {
    const err = new Error('DNI inválido: debe tener 8 dígitos');
    err.status = 400;
    throw err;
  }
  if (tipo === 'RUC' && !/^\d{11}$/.test(numero)) {
    const err = new Error('RUC inválido: debe tener 11 dígitos');
    err.status = 400;
    throw err;
  }

  return enqueue(() =>
    consultarSunat({
      tipo,
      numero,
      timeoutMs: TIMEOUT_MS,
      headless: HEADLESS,
      sunatUrl: SUNAT_URL,
    })
  );
}

function sendError(res, e) {
  const code = e?.code;
  const message = e instanceof Error ? e.message : 'Error desconocido';

  if (e?.status === 400) {
    return res.status(400).json({ ok: false, code: 'VALIDATION', mensaje: message });
  }
  if (code === 'IDENTITY_CAPTCHA' || /captcha/i.test(message)) {
    return res.status(503).json({
      ok: false,
      code: 'IDENTITY_CAPTCHA',
      mensaje: 'SUNAT requiere captcha. Reintente más tarde o use consulta manual.',
    });
  }
  if (code === 'IDENTITY_PARSE') {
    return res.status(502).json({ ok: false, code: 'IDENTITY_PARSE', mensaje: message });
  }
  if (/timeout|Timeout/i.test(message) || e?.name === 'TimeoutError') {
    return res.status(503).json({ ok: false, code: 'IDENTITY_TIMEOUT', mensaje: 'Timeout consultando SUNAT' });
  }
  console.error('[identity-sunat]', e);
  return res.status(503).json({
    ok: false,
    code: 'IDENTITY_PROVIDER_BLOCKED',
    mensaje: message || 'No se pudo consultar SUNAT',
  });
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

const server = app.listen(PORT, () => {
  console.log(`[identity-sunat] listening on :${PORT} headless=${HEADLESS} timeout=${TIMEOUT_MS}ms`);
});

async function shutdown() {
  server.close();
  await closeBrowser();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
