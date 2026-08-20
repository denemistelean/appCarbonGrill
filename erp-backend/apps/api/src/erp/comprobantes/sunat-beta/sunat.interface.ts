export type SunatTipoComprobante = 'BOLETA' | 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
export type SunatEstado = 'PENDIENTE' | 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO' | 'ERROR';

export type SunatEmitirItemDto = {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  igv?: number;
};

export type SunatEmitirDto = {
  tipo: SunatTipoComprobante;
  id_venta?: number;
  id_cliente?: number;
  documento_cliente: string;
  razon_social_cliente: string;
  direccion?: string | null;
  moneda?: string;
  items: SunatEmitirItemDto[];
  totales: { gravado?: number; igv?: number; total: number };
  serie?: string;
  correlativo?: number;
  documento_modifica?: {
    tipo: SunatTipoComprobante;
    /** Código catálogo 01: 01=Factura, 03=Boleta */
    tipo_doc_codigo?: string;
    serie: string;
    correlativo: number | string;
    /** Código catálogo 09 (NC) o 10 (ND) */
    codigo_motivo?: string;
    motivo: string;
  };
};

export type SunatComprobanteResultado = {
  estado: SunatEstado;
  tipo: SunatTipoComprobante;
  serie: string;
  correlativo: number;
  xmlUrl?: string | null;
  cdrUrl?: string | null;
  pdfUrl?: string | null;
  /** Representación impresa ticket 80mm (HTML→PDF) */
  pdfTicketUrl?: string | null;
  qr?: string | null;
  hash?: string | null;
  mensaje?: string | null;
  codigo_sunat?: string | null;
  fecha_emision?: string | null;
};

/**
 * Contrato público de facturación electrónica.
 * Implementación real SUNAT se enchufa reemplazando el provider del token
 * SUNAT_SERVICE sin tocar POS ni otros módulos de negocio.
 */
export interface ISunatService {
  emitirComprobante(datos: SunatEmitirDto): Promise<SunatComprobanteResultado>;
  consultarEstado(comprobanteId: number | string): Promise<SunatComprobanteResultado>;
  reenviar(comprobanteId: number | string): Promise<SunatComprobanteResultado>;
  anular(comprobanteId: number | string, motivo: string): Promise<SunatComprobanteResultado>;
}

/** @deprecated Usar SunatComprobanteResultado */
export type SunatResultado = SunatComprobanteResultado;
