import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import { AbrirSesionDto, CartaPedidoDto, LlamarMozoDto } from './carta.dto';
import { CartaService } from './carta.service';

@Controller('carta-publica')
export class CartaPublicaController {
  constructor(private readonly service: CartaService) {}

  @Get(':token')
  contexto(@Param('token') token: string) {
    return this.service.contextoPublico(token);
  }

  @Post(':token/pedido')
  pedido(@Param('token') token: string, @Body() dto: CartaPedidoDto) {
    return this.service.enviarPrepedido(token, dto);
  }

  @Post(':token/llamar')
  llamar(@Param('token') token: string, @Body() dto: LlamarMozoDto) {
    return this.service.llamarMozo(token, dto);
  }
}

@Controller('carta')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CartaStaffController {
  constructor(private readonly service: CartaService) {}

  @Get('llamados')
  @RequirePermissions('CARTA', 'ver_llamado')
  llamados(@Query() query: any, @Req() req: any) {
    return this.service.llamados(query, resolveRequestUser(req));
  }

  @Post('llamados/:id/atender')
  @RequirePermissions('CARTA', 'atender_llamado')
  atender(@Param('id') id: string, @Req() req: any) {
    return this.service.atenderLlamado(Number(id), resolveRequestUser(req));
  }

  @Get('mesas/:id/qr')
  @RequirePermissions('CARTA', 'ver_qr_mesa')
  qr(@Param('id') id: string, @Req() req: any) {
    return this.service.qrMesa(Number(id), resolveRequestUser(req));
  }

  @Post('sesiones/abrir')
  @RequirePermissions('CARTA', 'gestionar_sesion_qr')
  abrir(@Body() dto: AbrirSesionDto, @Req() req: any) {
    return this.service.abrirSesion(dto, resolveRequestUser(req));
  }

  @Post('sesiones/:idMesa/cerrar')
  @RequirePermissions('CARTA', 'gestionar_sesion_qr')
  cerrar(@Param('idMesa') idMesa: string, @Req() req: any) {
    return this.service.cerrarSesion(Number(idMesa), resolveRequestUser(req));
  }
}
