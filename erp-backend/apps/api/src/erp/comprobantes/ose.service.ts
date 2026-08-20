import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetaOseAdapter } from './sunat-beta/beta-ose.adapter';

export type OsePayload = {
  tipo: '01' | '03' | '07';
  serie: string;
  correlativo: number;
  fechaEmision: Date;
  cliente: {
    tipoDoc: string;
    numDoc: string | null;
    razonSocial: string;
    direccion: string | null;
  };
  sucursal: {
    codigoEstablecimiento: string;
    nombre: string;
    direccion: string | null;
  };
  emisor?: {
    ruc: string;
    razonSocial: string;
    nombreComercial: string;
    ubigeo: string;
    direccion: string;
    departamento: string;
    provincia: string;
    distrito: string;
  };
  nubefact?: { url?: string | null; token?: string | null };
  opGravada: number;
  igv: number;
  total: number;
  items: {
    codigo: string | null;
    descripcion: string;
    unidad: string;
    cantidad: number;
    valorUnitario: number;
    precioUnitario: number;
    opGravada: number;
    igv: number;
    total: number;
  }[];
  afectado?: { tipo: string; serie: string; correlativo: number; motivo: string };
};

export type OseResultado = {
  aceptado: boolean;
  hash: string | null;
  mensaje: string;
  enlacePdf: string | null;
  xmlEnviado: string;
  xmlCdr: string;
  contingencia?: boolean;
};

@Injectable()
export class OseService {
  private readonly logger = new Logger(OseService.name);
  private readonly igvPct = 18;

  constructor(
    private readonly config: ConfigService,
    private readonly betaAdapter: BetaOseAdapter,
  ) {}

  modo(): string {
    return String(this.config.get('OSE_MODO') || 'MOCK').toUpperCase();
  }

  emisor(override?: OsePayload['emisor'] | null) {
    const beta = this.modo() === 'BETA';
    const base = {
      ruc: beta
        ? this.config.get<string>('SUNAT_RUC_EMISOR') || '20481099936'
        : this.config.get<string>('EMPRESA_RUC') || '20123456789',
      razonSocial: this.config.get<string>('EMPRESA_RAZON_SOCIAL') || 'CARBON GRILL SAC',
      nombreComercial: this.config.get<string>('EMPRESA_NOMBRE_COMERCIAL') || 'CARBON GRILL',
      ubigeo: this.config.get<string>('EMPRESA_UBIGEO') || '150101',
      direccion: this.config.get<string>('EMPRESA_DIRECCION') || 'LIMA',
      departamento: this.config.get<string>('EMPRESA_DEPARTAMENTO') || 'LIMA',
      provincia: this.config.get<string>('EMPRESA_PROVINCIA') || 'LIMA',
      distrito: this.config.get<string>('EMPRESA_DISTRITO') || 'LIMA',
    };
    if (!override) return base;
    return {
      ruc: beta ? base.ruc : override.ruc || base.ruc,
      razonSocial: override.razonSocial || base.razonSocial,
      nombreComercial: override.nombreComercial || base.nombreComercial,
      ubigeo: override.ubigeo || base.ubigeo,
      direccion: override.direccion || base.direccion,
      departamento: override.departamento || base.departamento,
      provincia: override.provincia || base.provincia,
      distrito: override.distrito || base.distrito,
    };
  }

  fallaAContingencia() {
    const v = String(this.config.get('OSE_FALLA_CONTINGENCIA') || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'si' || v === 'yes';
  }

  async enviar(payload: OsePayload): Promise<OseResultado> {
    if (this.modo() === 'CONTINGENCIA') return this.enviarContingencia(payload);
    if (this.modo() === 'BETA') {
      return this.betaAdapter.enviar(payload, this.emisor(payload.emisor));
    }
    if (this.modo() === 'NUBEFACT') {
      const r = await this.enviarNubefact(payload);
      if (!r.aceptado && this.fallaAContingencia()) {
        const c = this.enviarContingencia(payload);
        return { ...c, mensaje: `Contingencia por fallo OSE: ${r.mensaje}` };
      }
      return r;
    }
    return this.enviarMock(payload);
  }

  private enviarContingencia(payload: OsePayload): OseResultado {
    const emisor = this.emisor(payload.emisor);
    const clave = `${payload.serie}-${String(payload.correlativo).padStart(8, '0')}`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <ID>${this.esc(clave)}</ID>
  <IssueDate>${payload.fechaEmision.toISOString().slice(0, 10)}</IssueDate>
  <InvoiceTypeCode>${payload.tipo}</InvoiceTypeCode>
  <Note>CONTINGENCIA — pendiente de envío al OSE</Note>
  <AccountingSupplierParty><CustomerAssignedAccountID>${this.esc(emisor.ruc)}</CustomerAssignedAccountID></AccountingSupplierParty>
  <LegalMonetaryTotal><PayableAmount currencyID="PEN">${payload.total.toFixed(2)}</PayableAmount></LegalMonetaryTotal>
</Invoice>`;
    this.logger.warn(`OSE contingencia ${payload.tipo} ${clave}`);
    return {
      aceptado: false,
      contingencia: true,
      hash: null,
      mensaje: 'Emitido en contingencia. Pendiente de envío al OSE.',
      enlacePdf: null,
      xmlEnviado: xml,
      xmlCdr: '',
    };
  }

  private async enviarMock(payload: OsePayload): Promise<OseResultado> {
    const emisor = this.emisor(payload.emisor);
    const clave = `${payload.serie}-${String(payload.correlativo).padStart(8, '0')}`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <ID>${this.esc(clave)}</ID>
  <IssueDate>${payload.fechaEmision.toISOString().slice(0, 10)}</IssueDate>
  <InvoiceTypeCode>${payload.tipo}</InvoiceTypeCode>
  <DocumentCurrencyCode>PEN</DocumentCurrencyCode>
  <AccountingSupplierParty><CustomerAssignedAccountID>${this.esc(emisor.ruc)}</CustomerAssignedAccountID></AccountingSupplierParty>
  <AccountingCustomerParty><CustomerAssignedAccountID>${this.esc(payload.cliente.numDoc || '0')}</CustomerAssignedAccountID></AccountingCustomerParty>
  <LegalMonetaryTotal><PayableAmount currencyID="PEN">${payload.total.toFixed(2)}</PayableAmount></LegalMonetaryTotal>
  <Note>MOCK OSE — no enviado a SUNAT</Note>
</Invoice>`;
    const cdr = `<?xml version="1.0"?><ApplicationResponse><ResponseCode>0</ResponseCode><Description>Aceptado MOCK ${clave}</Description></ApplicationResponse>`;
    this.logger.log(`OSE MOCK aceptó ${payload.tipo} ${clave}`);
    return {
      aceptado: true,
      hash: `MOCK${clave.replace(/[^A-Z0-9]/g, '')}`,
      mensaje: 'Aceptado en modo MOCK (sin envío a SUNAT)',
      enlacePdf: null,
      xmlEnviado: xml,
      xmlCdr: cdr,
    };
  }

  private async enviarNubefact(payload: OsePayload): Promise<OseResultado> {
    const url = payload.nubefact?.url || this.config.get<string>('NUBEFACT_URL');
    const token = payload.nubefact?.token || this.config.get<string>('NUBEFACT_TOKEN');
    if (!url || !token) {
      return {
        aceptado: false,
        hash: null,
        mensaje: 'Faltan URL o token de Nubefact en la sucursal (o en el entorno)',
        enlacePdf: null,
        xmlEnviado: JSON.stringify(payload),
        xmlCdr: '',
      };
    }

    const tipoNube = payload.tipo === '01' ? 1 : payload.tipo === '03' ? 2 : 3;
    const tipoDocNube = this.mapTipoDoc(payload.cliente.tipoDoc);
    const body: any = {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: tipoNube,
      serie: payload.serie,
      numero: payload.correlativo,
      sunat_transaction: 1,
      cliente_tipo_de_documento: tipoDocNube,
      cliente_numero_de_documento: payload.cliente.numDoc || '-',
      cliente_denominacion: payload.cliente.razonSocial,
      cliente_direccion: payload.cliente.direccion || '',
      fecha_de_emision: this.fechaNube(payload.fechaEmision),
      moneda: 1,
      porcentaje_de_igv: this.igvPct,
      total_gravada: payload.opGravada,
      total_igv: payload.igv,
      total: payload.total,
      enviar_automaticamente_a_la_sunat: true,
      codigo_unico: `${payload.tipo}-${payload.serie}-${payload.correlativo}`,
      items: payload.items.map((it) => ({
        unidad_de_medida: it.unidad || 'NIU',
        codigo: it.codigo || '',
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        valor_unitario: it.valorUnitario,
        precio_unitario: it.precioUnitario,
        subtotal: it.opGravada,
        tipo_de_igv: 1,
        igv: it.igv,
        total: it.total,
      })),
    };
    if (payload.afectado) {
      body.documento_que_se_modifica_tipo = payload.afectado.tipo === '01' ? 1 : 2;
      body.documento_que_se_modifica_serie = payload.afectado.serie;
      body.documento_que_se_modifica_numero = payload.afectado.correlativo;
      body.tipo_de_nota_de_credito = 1;
      body.motivo = payload.afectado.motivo;
    }

    const xmlEnviado = JSON.stringify(body);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: xmlEnviado,
      });
      const json: any = await res.json().catch(() => ({}));
      const xmlCdr = JSON.stringify(json);
      if (!res.ok || json.errors) {
        return {
          aceptado: false,
          hash: json.codigo_hash || null,
          mensaje: String(json.errors || json.sunat_soap_error || `HTTP ${res.status}`),
          enlacePdf: json.enlace_del_pdf || null,
          xmlEnviado,
          xmlCdr,
        };
      }
      return {
        aceptado: json.aceptada_por_sunat !== false,
        hash: json.codigo_hash || null,
        mensaje: String(json.sunat_description || json.sunat_note || 'Enviado a Nubefact'),
        enlacePdf: json.enlace_del_pdf || json.enlace || null,
        xmlEnviado,
        xmlCdr,
      };
    } catch (e: any) {
      this.logger.error(`Nubefact falló: ${e?.message}`);
      return {
        aceptado: false,
        hash: null,
        mensaje: e?.message || 'Error de red con Nubefact',
        enlacePdf: null,
        xmlEnviado,
        xmlCdr: '',
      };
    }
  }

  private mapTipoDoc(tipo: string) {
    if (tipo === '6') return 6;
    if (tipo === '1') return 1;
    if (tipo === '4') return 4;
    if (tipo === '7') return 7;
    return 0;
  }

  private fechaNube(d: Date) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  }

  private esc(v: string) {
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
