import { Injectable, Logger } from '@nestjs/common';
import { PdfService } from '@app/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as QRCode from 'qrcode';
import { montoEnLetrasSoles } from './moneda-letras';

/**
 * Representación impresa CPE: mismas plantillas, fuentes y orden que AppRepuestosAT.
 * A4 (Arial) + ticket 80 mm (Courier New). Logo: uploads/empresa/logo_factura.png
 */
@Injectable()
export class CpeRepresentacionService {
  private readonly logger = new Logger(CpeRepresentacionService.name);

  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly pdfService: PdfService,
  ) {}

  async generar(comprobante: any, formato: 'a4' | 'ticket'): Promise<{ buf: Buffer; fileName: string }> {
    const data = await this.buildData(comprobante);
    const tpl = formato === 'a4' ? 'cpe-a4.html' : 'cpe-ticket-80.html';
    const html = this.renderTemplate(this.loadTemplate(tpl), data);
    const buf =
      formato === 'a4'
        ? await this.pdfService.generarPdfBuffer(html, { sinMargenPagina: false })
        : await this.pdfService.generarPdfBuffer(html, {
            sinMargenPagina: true,
            widthMm: 80,
            fitContentHeight: true,
            heightAnchorSelector: '.qr',
            marginBottomMm: 5,
          });

    const fileNameBase = `${data.empresa_ruc}-${data.tipo_codigo}-${comprobante.serie}-${Number(comprobante.correlativo)}`;
    const fileName = formato === 'a4' ? `${fileNameBase}.pdf` : `${fileNameBase}-ticket.pdf`;
    try {
      const storage = this.resolveStorage();
      mkdirSync(storage, { recursive: true });
      writeFileSync(join(storage, fileName), buf);
    } catch (e) {
      this.logger.warn(`No se guardó PDF en disco: ${e instanceof Error ? e.message : e}`);
    }
    return { buf, fileName };
  }

  private async buildData(c: any) {
    const emisor = c.emisor || {};
    const [usuario] = await this.dataSource.query(
      `SELECT CONCAT(IFNULL(nombres,''), ' ', IFNULL(apellidos,'')) AS nombre
       FROM sis_usuario WHERE id_usuario = ? LIMIT 1`,
      [c.id_usuario_crea],
    );
    let formaPago = 'CONTADO';
    if (c.id_cobro) {
      const [pago] = await this.dataSource.query(
        `SELECT medio FROM cobro_medio WHERE id_cobro = ? AND estado_registro = 'ACTIVO' ORDER BY id_cobro_medio ASC LIMIT 1`,
        [c.id_cobro],
      );
      if (pago?.medio) formaPago = String(pago.medio).toUpperCase();
    }

    const tipo = String(c.tipo || '03');
    const tipoLabel =
      tipo === '01'
        ? 'Factura Electrónica'
        : tipo === '07'
          ? 'Nota de Crédito Electrónica'
          : 'Boleta de Venta Electrónica';
    const tipoCodigo = tipo === '01' ? '01' : tipo === '07' ? '07' : '03';
    const correlativo = String(c.correlativo).padStart(8, '0');
    const total = this.round2(Number(c.total || 0));
    const gravada = this.round2(Number(c.op_gravada != null ? c.op_gravada : total / 1.18));
    const igv = this.round2(Number(c.igv != null ? c.igv : total - gravada));
    const qrText =
      c.ose_hash && String(c.ose_hash).includes('|')
        ? String(c.ose_hash)
        : `${emisor.ruc || ''}|${tipoCodigo}|${c.serie}|${Number(c.correlativo)}|${igv}|${total}`;
    const qrDataUrl = await QRCode.toDataURL(qrText, { margin: 0, width: 180 });
    const qrImg = `<img src="${qrDataUrl}" alt="QR" />`;
    const tipoDoc = this.etiquetaTipoDoc(c.tipo_doc_cliente);
    const docNum = String(c.num_doc_cliente || '00000000');

    const items = (c.items || []).map((d: any, i: number) => {
      const cant = Number(d.cantidad || 0);
      const pu = this.round2(Number(d.precio_unitario || 0));
      const imp = this.round2(Number(d.total != null ? d.total : cant * pu));
      return {
        item: String(i + 1),
        codigo: d.codigo || '-',
        descripcion: d.descripcion || 'ITEM',
        unidad: d.unidad || 'NIU',
        cantidad: this.fmtQty(cant),
        precio_unitario: this.fmtMoney(pu),
        importe: this.fmtMoney(imp),
      };
    });

    return {
      empresa_razon: emisor.razonSocial || emisor.nombreComercial || 'CARBON GRILL',
      empresa_ruc: emisor.ruc || '',
      empresa_direccion: emisor.direccion || c.sucursal_direccion || '',
      empresa_ubigeo: [emisor.distrito, emisor.provincia, emisor.departamento].filter(Boolean).join(', '),
      empresa_telefono: c.sucursal_telefono || process.env.EMPRESA_TELEFONO || '',
      empresa_email: process.env.EMPRESA_EMAIL || '',
      empresa_web: process.env.EMPRESA_WEB || '',
      tipo_comprobante_label: tipoLabel,
      tipo_codigo: tipoCodigo,
      serie: c.serie,
      correlativo,
      fecha_emision: this.fmtFecha(c.fecha_emision || new Date().toISOString()),
      forma_pago: formaPago,
      moneda: 'Soles',
      cliente_documento: `${tipoDoc}: ${docNum}`,
      cliente_razon: c.razon_social_cliente || 'CLIENTE VARIOS',
      cliente_direccion: c.direccion_cliente || '-',
      placa: '-',
      guia_remision: '-',
      items,
      itemsCount: items.length,
      gravada: this.fmtMoney(gravada),
      igv: this.fmtMoney(igv),
      descuento: this.fmtMoney(0),
      total: this.fmtMoney(total),
      importe_letras: montoEnLetrasSoles(total),
      banco_nombre: process.env.EMPRESA_BANCO_NOMBRE || '-',
      banco_titular: process.env.EMPRESA_BANCO_TITULAR || emisor.razonSocial || 'CARBON GRILL SAC',
      banco_cuenta: process.env.EMPRESA_BANCO_CUENTA || '-',
      banco_cci: process.env.EMPRESA_BANCO_CCI || '-',
      resolucion_sunat: process.env.SUNAT_RESOLUCION || '-',
      hash: c.ose_hash || '-',
      vendedor: String(usuario?.nombre || '-').trim() || '-',
      id_venta: String(c.id_cuenta || c.id_comprobante),
      qr_img: qrImg,
      qr: qrText,
      logo_img: this.loadLogoImg(c.emisor_logo_path),
    };
  }

  private etiquetaTipoDoc(tipo: string) {
    const t = String(tipo || '0');
    if (t === '6') return 'RUC';
    if (t === '1') return 'DNI';
    if (t === '4') return 'CE';
    if (t === '7') return 'PAS';
    return '0';
  }

  private loadLogoImg(relativePath?: string | null): string {
    const candidates = [
      relativePath ? join(process.cwd(), 'uploads', String(relativePath).replace(/^\/+/, '')) : null,
      process.env.EMPRESA_LOGO_PATH,
      join(resolve(process.cwd(), 'uploads', 'empresa'), 'logo_factura.png'),
      join(resolve(process.cwd(), 'uploads', 'empresa'), 'logo_factura.jpg'),
      join(resolve(process.cwd(), 'uploads', 'empresa'), 'logo_factura.jpeg'),
      join(resolve(process.cwd(), 'uploads', 'empresa'), 'logo_factura.webp'),
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      const abs = p.startsWith('/') || /^[A-Za-z]:/.test(p) ? p : resolve(process.cwd(), p);
      if (!existsSync(abs)) continue;
      const ext = abs.split('.').pop()?.toLowerCase() || 'png';
      const mime =
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
      const b64 = readFileSync(abs).toString('base64');
      return `<img class="logo" src="data:${mime};base64,${b64}" alt="Logo" />`;
    }
    return '';
  }

  private loadTemplate(name: string): string {
    const candidates = [
      join(__dirname, 'templates', name),
      resolve(process.cwd(), 'apps/api/src/erp/comprobantes/templates', name),
      resolve(process.cwd(), 'dist/apps/api/erp/comprobantes/templates', name),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return readFileSync(p, 'utf8');
    }
    throw new Error(`Plantilla CPE no encontrada: ${name}`);
  }

  private renderTemplate(template: string, data: Record<string, unknown>): string {
    let html = String(template || '');
    html = html.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) => {
      const arr = data[key];
      if (!Array.isArray(arr)) return '';
      return arr
        .map((item) => {
          const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : { value: item };
          return inner.replace(/\{\{(\w+)\}\}/g, (_m2, k: string) => String(row[k] ?? ''));
        })
        .join('');
    });
    html = html.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
      const v = data[key];
      if (v == null) return '';
      if (typeof v === 'object') return '';
      return String(v);
    });
    return html;
  }

  private resolveStorage(): string {
    const p = String(process.env.SUNAT_STORAGE_DIR || 'uploads/cpe').trim();
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return p;
    return resolve(process.cwd(), p);
  }

  private round2(n: number) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  private fmtMoney(n: number) {
    return this.round2(n).toFixed(2);
  }

  private fmtQty(n: number) {
    const x = Number(n) || 0;
    return Number.isInteger(x) ? String(x) : x.toFixed(3);
  }

  private fmtFecha(v: string | Date) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
