import { Injectable, Logger } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import JSZip from 'jszip';
import type { OsePayload, OseResultado } from '../ose.service';
import { loadSunatConfig } from './sunat.config';
import { SunatEmitirDto } from './sunat.interface';
import { buildInvoiceUbl, EmisorUbl } from './ubl-builder';
import { buildCreditNoteUbl } from './ubl-credit-note';
import { signUblXml } from './xml-signer';
import { sendBill } from './sunat-soap.client';
import { xmlToLatin1Buffer } from './xml-text.util';

/**
 * SUNAT Beta (mismas credenciales de prueba que APPREPUESTOSAT).
 * Firma UBL + ZIP + SOAP sendBill. No usa Nubefact.
 */
@Injectable()
export class BetaOseAdapter {
  private readonly logger = new Logger(BetaOseAdapter.name);

  async enviar(payload: OsePayload, emisorOse: NonNullable<OsePayload['emisor']>): Promise<OseResultado> {
    const cfg = loadSunatConfig();
    const emisor: EmisorUbl = {
      ruc: cfg.rucEmisor,
      razon_social: emisorOse.razonSocial,
      nombre_comercial: emisorOse.nombreComercial,
      direccion: emisorOse.direccion,
      ubigeo: emisorOse.ubigeo,
      distrito: emisorOse.distrito,
      provincia: emisorOse.provincia,
      departamento: emisorOse.departamento,
      codigo_establecimiento: payload.sucursal.codigoEstablecimiento || '0000',
    };

    const datos = this.toEmitirDto(payload);
    const built =
      payload.tipo === '07' ? buildCreditNoteUbl(datos, emisor) : buildInvoiceUbl(datos, emisor);

    const storageRoot = this.resolveStorage(cfg.storageDir);
    mkdirSync(storageRoot, { recursive: true });
    const certPath = cfg.certPath && !isAbsolute(cfg.certPath)
      ? resolve(process.cwd(), cfg.certPath)
      : cfg.certPath;

    let signedXml: string;
    try {
      signedXml = signUblXml(built.xml, certPath, cfg.certPassword);
    } catch (e: any) {
      this.logger.error(`Firma XML falló: ${e?.message}`);
      writeFileSync(join(storageRoot, `${built.fileNameBase}.unsigned.xml`), xmlToLatin1Buffer(built.xml));
      return {
        aceptado: false,
        hash: built.digestPreview,
        mensaje: e?.message || 'No se pudo firmar el XML',
        enlacePdf: null,
        xmlEnviado: built.xml,
        xmlCdr: '',
      };
    }

    const signedBytes = xmlToLatin1Buffer(signedXml);
    writeFileSync(join(storageRoot, `${built.fileNameBase}.xml`), signedBytes);
    const zip = new JSZip();
    zip.file(`${built.fileNameBase}.xml`, signedBytes);
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    writeFileSync(join(storageRoot, `${built.fileNameBase}.zip`), zipBuf);

    this.logger.log(`SUNAT BETA sendBill ${built.fileNameBase}.zip user=${cfg.usuarioSol}`);

    let soap;
    try {
      soap = await sendBill(cfg, `${built.fileNameBase}.zip`, zipBuf.toString('base64'));
    } catch (e: any) {
      return {
        aceptado: false,
        hash: built.digestPreview,
        mensaje: `Error de conexión SUNAT beta: ${e?.message || e}`,
        enlacePdf: null,
        xmlEnviado: signedXml,
        xmlCdr: '',
      };
    }

    writeFileSync(join(storageRoot, `${built.fileNameBase}.response.xml`), soap.rawXml, 'utf8');

    if (soap.fault) {
      return {
        aceptado: false,
        hash: built.digestPreview,
        mensaje: soap.fault.slice(0, 500),
        enlacePdf: null,
        xmlEnviado: signedXml,
        xmlCdr: soap.rawXml,
      };
    }

    let xmlCdr = soap.rawXml;
    let codigo: string | null = null;
    let mensaje = 'Enviado a SUNAT beta';
    if (soap.applicationResponseBase64) {
      writeFileSync(
        join(storageRoot, `R-${built.fileNameBase}.zip`),
        Buffer.from(soap.applicationResponseBase64, 'base64'),
      );
      const parsed = await this.parseCdr(soap.applicationResponseBase64);
      codigo = parsed.codigo;
      mensaje = parsed.mensaje || mensaje;
      xmlCdr = parsed.xml || soap.rawXml;
    }

    const aceptado = codigo === '0' || codigo === '00' || (!!codigo && /^0\d+/.test(codigo));
    if (codigo && !aceptado && !/^0/.test(codigo)) {
      return {
        aceptado: false,
        hash: built.digestPreview,
        mensaje: `SUNAT ${codigo}: ${mensaje}`,
        enlacePdf: null,
        xmlEnviado: signedXml,
        xmlCdr,
      };
    }

    return {
      aceptado: true,
      hash: built.digestPreview,
      mensaje: codigo && codigo !== '0' && codigo !== '00' ? `Observado ${codigo}: ${mensaje}` : mensaje,
      enlacePdf: null,
      xmlEnviado: signedXml,
      xmlCdr,
    };
  }

  private toEmitirDto(payload: OsePayload): SunatEmitirDto {
    const tipo = payload.tipo === '01' ? 'FACTURA' : payload.tipo === '07' ? 'NOTA_CREDITO' : 'BOLETA';
    const dto: SunatEmitirDto = {
      tipo,
      documento_cliente: payload.cliente.numDoc || (tipo === 'FACTURA' ? '' : '00000000'),
      razon_social_cliente: payload.cliente.razonSocial,
      direccion: payload.cliente.direccion,
      moneda: 'PEN',
      serie: payload.serie,
      correlativo: payload.correlativo,
      items: payload.items.map((it) => ({
        codigo: it.codigo || undefined,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        valor_unitario: it.precioUnitario,
        igv: it.igv,
      })),
      totales: { gravado: payload.opGravada, igv: payload.igv, total: payload.total },
    };
    if (payload.tipo === '07' && payload.afectado) {
      dto.documento_modifica = {
        tipo: payload.afectado.tipo === '01' ? 'FACTURA' : 'BOLETA',
        tipo_doc_codigo: payload.afectado.tipo,
        serie: payload.afectado.serie,
        correlativo: payload.afectado.correlativo,
        codigo_motivo: '01',
        motivo: payload.afectado.motivo || 'ANULACION',
      };
    }
    return dto;
  }

  private resolveStorage(p: string) {
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return p;
    return resolve(process.cwd(), p);
  }

  private async parseCdr(base64Zip: string): Promise<{ codigo: string | null; mensaje: string | null; xml: string | null }> {
    try {
      const zip = await JSZip.loadAsync(Buffer.from(base64Zip, 'base64'));
      const xmlEntry = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.xml'));
      if (!xmlEntry) return { codigo: null, mensaje: 'CDR sin XML', xml: null };
      const xml = await zip.files[xmlEntry].async('string');
      const codigo = xml.match(/<(?:[\w-]+:)?ResponseCode[^>]*>([^<]+)<\//i)?.[1]?.trim() || null;
      const mensaje = xml.match(/<(?:[\w-]+:)?Description[^>]*>([^<]+)<\//i)?.[1]?.trim() || null;
      return { codigo, mensaje, xml };
    } catch {
      return { codigo: null, mensaje: 'No se pudo leer CDR', xml: null };
    }
  }
}
