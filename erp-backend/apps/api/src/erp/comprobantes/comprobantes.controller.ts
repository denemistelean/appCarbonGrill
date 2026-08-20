import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import type { Response } from 'express';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import {
  AnularComprobanteDto,
  CrearSerieDto,
  EmitirComprobanteDto,
  EmitirNotaCreditoDto,
} from './comprobantes.dto';
import { ComprobantesService } from './comprobantes.service';
import { CpeRepresentacionService } from './cpe-representacion.service';

@Controller('comprobantes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComprobantesController {
  constructor(
    private readonly service: ComprobantesService,
    private readonly cpePdf: CpeRepresentacionService,
  ) {}

  @Get('catalogos')
  @RequirePermissions('COMPROBANTES', 'ver_comprobante')
  catalogos() {
    return this.service.catalogos();
  }

  @Get('sucursales')
  @RequirePermissions('COMPROBANTES', 'ver_comprobante')
  sucursales(@Req() req: any) {
    return this.service.listaSucursales(resolveRequestUser(req));
  }

  @Get('series')
  @RequirePermissions('COMPROBANTES', 'ver_comprobante')
  series(@Query() query: any, @Req() req: any) {
    return this.service.listaSeries(query, resolveRequestUser(req));
  }

  @Post('series')
  @RequirePermissions('COMPROBANTES', 'gestionar_serie')
  crearSerie(@Body() dto: CrearSerieDto, @Req() req: any) {
    return this.service.crearSerie(dto, resolveRequestUser(req));
  }

  @Get('cuenta/:idCuenta/preview')
  @RequirePermissions('COMPROBANTES', 'ver_comprobante')
  preview(@Param('idCuenta') idCuenta: string, @Req() req: any) {
    return this.service.previewCuenta(Number(idCuenta), resolveRequestUser(req));
  }

  @Get()
  @RequirePermissions('COMPROBANTES', 'ver_comprobante')
  findAll(@Query() query: any, @Req() req: any) {
    return this.service.findAll(query, resolveRequestUser(req));
  }

  @Get(':id/pdf')
  @RequirePermissions('COMPROBANTES', 'ver_comprobante')
  async pdf(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const c = await this.service.findOne(Number(id), resolveRequestUser(req));
    const { buf, fileName } = await this.cpePdf.generar(c, 'a4');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=${fileName}`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  @Get(':id/ticket')
  @RequirePermissions('COMPROBANTES', 'ver_comprobante')
  async ticket(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const c = await this.service.findOne(Number(id), resolveRequestUser(req));
    const { buf, fileName } = await this.cpePdf.generar(c, 'ticket');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=${fileName}`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  @Get(':id/xml')
  @RequirePermissions('COMPROBANTES', 'ver_xml')
  async xml(@Param('id') id: string, @Query('tipo') tipo: string, @Req() req: any, @Res() res: Response) {
    const c = await this.service.findOne(Number(id), resolveRequestUser(req));
    const body = tipo === 'cdr' ? c.xml_cdr : c.xml_enviado;
    if (!body) {
      res.status(404).json({ exito: false, mensaje: 'XML no disponible' });
      return;
    }
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename=${c.serie}-${c.correlativo}-${tipo === 'cdr' ? 'cdr' : 'xml'}.xml`,
    });
    res.end(String(body));
  }

  @Get(':id')
  @RequirePermissions('COMPROBANTES', 'ver_comprobante')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(Number(id), resolveRequestUser(req));
  }

  @Post('emitir')
  @RequirePermissions('COMPROBANTES', 'emitir_comprobante')
  emitir(@Body() dto: EmitirComprobanteDto, @Req() req: any) {
    return this.service.emitir(dto, resolveRequestUser(req));
  }

  @Post('nota-credito')
  @RequirePermissions('COMPROBANTES', 'anular_comprobante')
  nc(@Body() dto: EmitirNotaCreditoDto, @Req() req: any) {
    return this.service.emitirNc(dto, resolveRequestUser(req));
  }

  @Post('reintentar-lote')
  @RequirePermissions('COMPROBANTES', 'reintentar_ose')
  reenviarLote(@Query() query: any, @Req() req: any) {
    return this.service.reenviarLote(query, resolveRequestUser(req));
  }

  @Post(':id/reenviar')
  @RequirePermissions('COMPROBANTES', 'emitir_comprobante')
  reenviar(@Param('id') id: string, @Req() req: any) {
    return this.service.reenviar(Number(id), resolveRequestUser(req));
  }

  @Post(':id/anular')
  @RequirePermissions('COMPROBANTES', 'anular_comprobante')
  anular(@Param('id') id: string, @Body() dto: AnularComprobanteDto, @Req() req: any) {
    return this.service.anular(Number(id), dto, resolveRequestUser(req));
  }
}
