import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Response } from 'express';
import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';

@Injectable()
export class PdfService {
  private readonly launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
  ];

  private readonly marginCero = { top: '0', right: '0', bottom: '0', left: '0' };

  async generarPdf(
    html: string,
    nombreArchivo: string,
    res: Response,
    options?: { sinMargenPagina?: boolean },
  ) {
    try {
      const pdfBuffer = await this.renderHtmlToPdf(html, { sinMargenPagina: options?.sinMargenPagina });
      this.enviarPdf(res, nombreArchivo, pdfBuffer);
    } catch (error) {
      console.error('Error generando PDF genérico:', error);
      throw new InternalServerErrorException('Error al generar el documento PDF');
    }
  }

  async generarPdfPorHojas(
    hojasHtml: string[],
    nombreArchivo: string,
    res: Response,
    options?: { sinMargenPagina?: boolean },
  ) {
    if (hojasHtml.length === 0) {
      throw new InternalServerErrorException('No hay contenido para generar el PDF');
    }
    if (hojasHtml.length === 1) {
      return this.generarPdf(hojasHtml[0], nombreArchivo, res, options);
    }

    const margin = options?.sinMargenPagina
      ? this.marginCero
      : { top: '6px', bottom: '6px', left: '6px', right: '6px' };

    try {
      const browser = await puppeteer.launch({ headless: true, args: this.launchArgs });
      const merged = await PDFDocument.create();

      for (const hojaHtml of hojasHtml) {
        const page = await browser.newPage();
        await page.setDefaultTimeout(300_000);
        await page.setContent(hojaHtml, { waitUntil: 'load' });
        const buf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin,
        });
        await page.close();

        const doc = await PDFDocument.load(buf);
        const copied = await merged.copyPages(doc, doc.getPageIndices());
        copied.forEach((p) => merged.addPage(p));
      }

      await browser.close();
      const pdfBytes = await merged.save();
      this.enviarPdf(res, nombreArchivo, Buffer.from(pdfBytes));
    } catch (error) {
      console.error('Error generando PDF por hojas:', error);
      throw new InternalServerErrorException('Error al generar el documento PDF');
    }
  }

  /**
   * Buffer PDF sin escribir Response (impresión / jobs internos).
   * - A4 por defecto
   * - Ticket: widthMm + heightMm, o widthMm + fitContentHeight (mide ancla / body)
   */
  async generarPdfBuffer(
    html: string,
    options?: {
      sinMargenPagina?: boolean;
      widthMm?: number;
      heightMm?: number;
      /** Mide alto real del HTML (ancla o document) y usa ese alto + marginBottomMm */
      fitContentHeight?: boolean;
      /** Selector CSS del último bloque (ej. ".qr"); si no hay, usa document */
      heightAnchorSelector?: string;
      /** Margen extra bajo el ancla (mm). Default 4 */
      marginBottomMm?: number;
      preferCssPageSize?: boolean;
    },
  ): Promise<Buffer> {
    return this.renderHtmlToPdf(html, options);
  }

  private async renderHtmlToPdf(
    html: string,
    options?: {
      sinMargenPagina?: boolean;
      widthMm?: number;
      heightMm?: number;
      fitContentHeight?: boolean;
      heightAnchorSelector?: string;
      marginBottomMm?: number;
      preferCssPageSize?: boolean;
    },
  ): Promise<Buffer> {
    const browser = await puppeteer.launch({ headless: true, args: this.launchArgs });
    const page = await browser.newPage();
    await page.setDefaultTimeout(300_000);

    const pxPerMm = 96 / 25.4;
    if (options?.widthMm) {
      // Viewport = ancho del ticket para que el layout/medición coincida con el PDF
      await page.setViewport({
        width: Math.ceil(options.widthMm * pxPerMm),
        height: 1200,
        deviceScaleFactor: 1,
      });
    }

    await page.setContent(html, { waitUntil: 'load' });
    // Esperar imágenes (logo/QR) para medir altura real
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }),
        ),
      );
    });

    const sinMargen = !!options?.sinMargenPagina || !!options?.widthMm;
    const margin = sinMargen
      ? this.marginCero
      : { top: '6px', bottom: '6px', left: '6px', right: '6px' };

    let heightMm = options?.heightMm;
    if (options?.widthMm && options?.fitContentHeight) {
      const anchor = options.heightAnchorSelector || '';
      const bottomPx = await page.evaluate((sel) => {
        const pad = (el: Element | null) => {
          if (!el) return 0;
          const r = el.getBoundingClientRect();
          return Math.ceil(r.bottom + window.scrollY);
        };
        const fromAnchor = sel ? pad(document.querySelector(sel)) : 0;
        const bodyH = Math.max(
          document.body?.scrollHeight || 0,
          document.documentElement?.scrollHeight || 0,
          pad(document.body),
        );
        // Si hay ancla (QR), cortar ahí; si no, alto del documento
        return fromAnchor > 0 ? fromAnchor : bodyH;
      }, anchor);
      const extra = options.marginBottomMm ?? 4;
      heightMm = Math.max(40, Math.ceil(bottomPx / pxPerMm) + extra);
    }

    const pdfOpts: Parameters<typeof page.pdf>[0] = {
      printBackground: true,
      margin,
      preferCSSPageSize: !!options?.preferCssPageSize,
    };

    if (options?.widthMm && heightMm) {
      pdfOpts.width = `${options.widthMm}mm`;
      pdfOpts.height = `${heightMm}mm`;
    } else {
      pdfOpts.format = 'A4';
    }

    const pdfBuffer = await page.pdf(pdfOpts);
    await browser.close();
    return Buffer.from(pdfBuffer);
  }

  private enviarPdf(res: Response, nombreArchivo: string, pdfBuffer: Buffer) {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=${nombreArchivo}.pdf`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}