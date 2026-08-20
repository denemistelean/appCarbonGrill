import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { ExcelService, PdfService } from '@app/common';
import type { Response } from 'express';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import { EncolarImpresionDto, TIPOS_REPORTE } from './reportes.dto';
import { ImpresionService } from './impresion.service';
import { ReportesService } from './reportes.service';

@Controller('reportes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportesController {
  constructor(
    private readonly reportes: ReportesService,
    private readonly impresion: ImpresionService,
    private readonly excelService: ExcelService,
    private readonly pdfService: PdfService,
  ) {}

  @Get('sucursales')
  @RequirePermissions('REPORTES', 'ver_reporte')
  sucursales(@Req() req: any) {
    return this.reportes.sucursales(resolveRequestUser(req));
  }

  @Get('consolidado')
  @RequirePermissions('REPORTES', 'ver_reporte')
  consolidado(@Query() query: any, @Req() req: any) {
    return this.reportes.consolidado(query, resolveRequestUser(req));
  }

  @Get('ventas')
  @RequirePermissions('REPORTES', 'ver_reporte')
  ventas(@Query() query: any, @Req() req: any) {
    return this.reportes.ventas(query, resolveRequestUser(req));
  }

  @Get('platos')
  @RequirePermissions('REPORTES', 'ver_reporte')
  platos(@Query() query: any, @Req() req: any) {
    return this.reportes.platos(query, resolveRequestUser(req));
  }

  @Get('rentabilidad')
  @RequirePermissions('REPORTES', 'ver_reporte')
  rentabilidad(@Query() query: any, @Req() req: any) {
    return this.reportes.rentabilidad(query, resolveRequestUser(req));
  }

  @Get('mermas')
  @RequirePermissions('REPORTES', 'ver_reporte')
  mermas(@Query() query: any, @Req() req: any) {
    return this.reportes.mermas(query, resolveRequestUser(req));
  }

  @Get('ocupacion')
  @RequirePermissions('REPORTES', 'ver_reporte')
  ocupacion(@Query() query: any, @Req() req: any) {
    return this.reportes.ocupacion(query, resolveRequestUser(req));
  }

  @Get('excel')
  @RequirePermissions('REPORTES', 'exportar_reporte')
  async excel(@Query() query: any, @Req() req: any, @Res() res: Response) {
    const tipo = String(query.tipo || 'ventas');
    if (!TIPOS_REPORTE.includes(tipo as any)) {
      res.status(400).json({ mensaje: 'Tipo de reporte inválido' });
      return;
    }
    const pack = await this.reportes.filasExport(tipo, query, resolveRequestUser(req));
    await this.excelService.generarExcel(pack.columnas, pack.data, `reporte-${tipo}`, pack.titulo, res);
  }

  @Get('pdf')
  @RequirePermissions('REPORTES', 'exportar_reporte')
  async pdf(@Query() query: any, @Req() req: any, @Res() res: Response) {
    const tipo = String(query.tipo || 'ventas');
    if (!TIPOS_REPORTE.includes(tipo as any)) {
      res.status(400).json({ mensaje: 'Tipo de reporte inválido' });
      return;
    }
    const pack = await this.reportes.filasExport(tipo, query, resolveRequestUser(req));
    const html = this.reportes.htmlPdf(`Reporte ${pack.titulo}`, pack.columnas, pack.data);
    await this.pdfService.generarPdf(html, `reporte-${tipo}`, res);
  }

  @Get('impresion')
  @RequirePermissions('REPORTES', 'ver_cola_impresion')
  cola(@Query() query: any, @Req() req: any) {
    return this.impresion.listar(query, resolveRequestUser(req));
  }

  @Post('impresion')
  @RequirePermissions('REPORTES', 'imprimir_ticket')
  encolar(@Body() dto: EncolarImpresionDto, @Req() req: any) {
    return this.impresion.encolar(dto, resolveRequestUser(req));
  }

  @Get('impresion/:id/escpos')
  @RequirePermissions('REPORTES', 'ver_cola_impresion')
  async escpos(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const file = await this.impresion.escposBuffer(Number(id), resolveRequestUser(req));
    const safe = String(file.titulo || 'ticket').replace(/[^a-zA-Z0-9_-]+/g, '_');
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename=${safe}.bin`,
      'Content-Length': file.buffer.length,
    });
    res.end(file.buffer);
  }

  @Post('impresion/:id/reintentar')
  @RequirePermissions('REPORTES', 'reintentar_impresion')
  reintentar(@Param('id') id: string, @Req() req: any) {
    return this.impresion.reintentar(Number(id), resolveRequestUser(req));
  }

  @Post('impresion/:id/marcar-impreso')
  @RequirePermissions('REPORTES', 'reintentar_impresion')
  marcar(@Param('id') id: string, @Req() req: any) {
    return this.impresion.marcarImpreso(Number(id), resolveRequestUser(req));
  }

  @Post('impresion/:id/error')
  @RequirePermissions('REPORTES', 'reintentar_impresion')
  error(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.impresion.marcarError(Number(id), body?.mensaje || 'Error de impresora', resolveRequestUser(req));
  }
}
