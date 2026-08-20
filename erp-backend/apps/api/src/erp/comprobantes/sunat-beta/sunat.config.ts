export type SunatAmbiente = 'BETA' | 'PRODUCCION' | 'MOCK';

export type SunatRuntimeConfig = {
  provider: 'mock' | 'beta';
  ambiente: SunatAmbiente;
  rucEmisor: string;
  usuarioSol: string;
  claveSol: string;
  endpoint: string;
  wsdl: string;
  timeoutMs: number;
  certPath: string;
  certPassword: string;
  serieBoleta: string;
  serieFactura: string;
  storageDir: string;
};

const BETA_ENDPOINT = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
const BETA_WSDL = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl';

/**
 * Config SUNAT desde env. BD (Configuración) es espejo/UX; el proceso usa env en runtime.
 * Credenciales beta oficiales: {RUC}MODDATOS / MODDATOS
 */
export function loadSunatConfig(): SunatRuntimeConfig {
  const ambiente = String(process.env.SUNAT_AMBIENTE || 'BETA').trim().toUpperCase() as SunatAmbiente;
  const providerRaw = String(process.env.SUNAT_PROVIDER || (ambiente === 'BETA' ? 'beta' : 'mock'))
    .trim()
    .toLowerCase();
  const provider = providerRaw === 'beta' ? 'beta' : 'mock';
  const ruc = String(process.env.SUNAT_RUC_EMISOR || '20481099936').trim();
  const endpoint = String(process.env.SUNAT_ENDPOINT || BETA_ENDPOINT).trim();

  return {
    provider,
    ambiente: ambiente === 'PRODUCCION' ? 'PRODUCCION' : ambiente === 'MOCK' ? 'MOCK' : 'BETA',
    rucEmisor: ruc,
    usuarioSol: String(process.env.SUNAT_USUARIO_SOL || `${ruc}MODDATOS`).trim(),
    claveSol: String(process.env.SUNAT_CLAVE_SOL || 'MODDATOS').trim(),
    endpoint,
    wsdl: String(process.env.SUNAT_WSDL || BETA_WSDL).trim(),
    timeoutMs: Math.max(5000, Number(process.env.SUNAT_TIMEOUT_MS || 30000)),
    certPath: String(process.env.SUNAT_CERT_PATH || '').trim(),
    certPassword: String(process.env.SUNAT_CERT_PASSWORD || '').trim(),
    serieBoleta: String(process.env.SUNAT_SERIE_BOLETA || 'B001').trim(),
    serieFactura: String(process.env.SUNAT_SERIE_FACTURA || 'F001').trim(),
    storageDir: String(process.env.SUNAT_STORAGE_DIR || 'uploads/cpe').trim(),
  };
}
