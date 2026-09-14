import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { PdfService } from '@app/common';
import type { Response } from 'express';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import { AbrirTurnoDto, CerrarTurnoDto, CobrarDto, PedirCuentaDto } from './caja.dto';
import { CajaService } from './caja.service';

@Controller('caja')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CajaController {
  constructor(
    private readonly cajaService: CajaService,
    private readonly pdfService: PdfService,
  ) {}

  @Get('catalogos')
  @RequirePermissions('CAJA', 'ver_caja')
  catalogos() {
    return this.cajaService.catalogos();
  }

  @Get('sucursales')
  @RequirePermissions('CAJA', 'ver_caja')
  sucursales(@Req() req: any) {
    return this.cajaService.listaSucursales(resolveRequestUser(req));
  }

  @Get('turno-actual')
  @RequirePermissions('CAJA', 'ver_caja')
  turnoActual(@Query() query: any, @Req() req: any) {
    return this.cajaService.turnoActual(query, resolveRequestUser(req));
  }

  @Get('turnos')
  @RequirePermissions('CAJA', 'ver_caja')
  turnos(@Query() query: any, @Req() req: any) {
    return this.cajaService.historialTurnos(query, resolveRequestUser(req));
  }

  @Get('turnos/:id')
  @RequirePermissions('CAJA', 'ver_caja')
  turno(@Param('id') id: string, @Req() req: any) {
    return this.cajaService.turnoPorId(Number(id), resolveRequestUser(req));
  }

  @Post('turnos/abrir')
  @RequirePermissions('CAJA', 'abrir_turno')
  abrir(@Body() dto: AbrirTurnoDto, @Req() req: any) {
    return this.cajaService.abrirTurno(dto, resolveRequestUser(req));
  }

  @Post('turnos/:id/cerrar')
  @RequirePermissions('CAJA', 'cerrar_turno')
  cerrar(@Param('id') id: string, @Body() dto: CerrarTurnoDto, @Req() req: any) {
    return this.cajaService.cerrarTurno(Number(id), dto, resolveRequestUser(req));
  }

  @Get('pendientes')
  @RequirePermissions('CAJA', 'ver_caja')
  pendientes(@Query() query: any, @Req() req: any) {
    return this.cajaService.pendientes(query, resolveRequestUser(req));
  }

  @Get('sin-comprobante')
  @RequirePermissions('CAJA', 'ver_caja')
  sinComprobante(@Query() query: any, @Req() req: any) {
    return this.cajaService.sinComprobante(query, resolveRequestUser(req));
  }

  @Get('cuentas/:idPedido/precuenta')
  @RequirePermissions('CAJA', 'ver_precuenta')
  async precuenta(@Param('idPedido') idPedido: string, @Req() req: any, @Res() res: Response) {
    const html = await this.cajaService.precuentaHtml(Number(idPedido), resolveRequestUser(req));
    const buf = await this.pdfService.generarPdfBuffer(html, {
      widthMm: 80,
      fitContentHeight: true,
      sinMargenPagina: true,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=precuenta-${idPedido}.pdf`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  @Get('cuentas/:idPedido')
  @RequirePermissions('CAJA', 'ver_caja')
  cuenta(@Param('idPedido') idPedido: string, @Req() req: any) {
    return this.cajaService.detalleCuenta(Number(idPedido), resolveRequestUser(req));
  }

  @Post('pedir-cuenta')
  @RequirePermissions('CAJA', 'pedir_cuenta')
  pedir(@Body() dto: PedirCuentaDto, @Req() req: any) {
    return this.cajaService.pedirCuenta(dto.id_pedido, resolveRequestUser(req));
  }

  @Post('cobrar')
  @RequirePermissions('CAJA', 'cobrar')
  cobrar(@Body() dto: CobrarDto, @Req() req: any) {
    return this.cajaService.cobrar(dto, resolveRequestUser(req));
  }
}
