import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { PdfService } from '@app/common';
import type { Response } from 'express';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import { PosEmitirCuentaDto, PosVentaDto } from './pos.dto';
import { PosService } from './pos.service';
import { ClientesService } from '../clientes/clientes.service';

@Controller('pos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PosController {
  constructor(
    private readonly service: PosService,
    private readonly pdfService: PdfService,
    private readonly clientes: ClientesService,
  ) {}

  @Get('identity/:tipo/:numero')
  @RequirePermissions('POS', 'ver_pos')
  identity(@Param('tipo') tipo: string, @Param('numero') numero: string) {
    return this.clientes.consultarIdentity(tipo, numero);
  }

  @Get('tipos')
  @RequirePermissions('POS', 'ver_pos')
  tipos() {
    return this.service.tiposVenta();
  }

  @Get('productos')
  @RequirePermissions('POS', 'ver_pos')
  productos(@Query() query: any, @Req() req: any) {
    return this.service.productos(query, resolveRequestUser(req));
  }

  @Post('ventas')
  @RequirePermissions('POS', 'crear_venta_pos')
  vender(@Body() dto: PosVentaDto, @Req() req: any) {
    return this.service.vender(dto, resolveRequestUser(req));
  }

  @Post('emitir-cuenta')
  @RequirePermissions('POS', 'crear_venta_pos')
  emitirCuenta(@Body() dto: PosEmitirCuentaDto, @Req() req: any) {
    return this.service.emitirDesdeCuenta(dto, resolveRequestUser(req));
  }

  @Get('documentos/:id/pdf')
  @RequirePermissions('POS', 'ver_pos')
  async pdf(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const html = await this.service.pdfInterno(Number(id), resolveRequestUser(req));
    const buf = await this.pdfService.generarPdfBuffer(html, {
      widthMm: 80,
      fitContentHeight: true,
      sinMargenPagina: true,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=documento-${id}.pdf`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }
}
