import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import { CambiarPreparacionDto, ConfirmarPedidoDto, UpsertPedidoDto } from './pedidos.dto';
import { PedidosService } from './pedidos.service';

@Controller('pedidos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get('estados')
  @RequirePermissions('PEDIDOS', 'ver_pedido')
  estados() {
    return this.pedidosService.catalogos();
  }

  @Get('sucursales')
  @RequirePermissions('PEDIDOS', 'ver_pedido')
  sucursales(@Req() req: any) {
    return this.pedidosService.listaSucursales(resolveRequestUser(req));
  }

  @Get('mesas')
  @RequirePermissions('PEDIDOS', 'ver_pedido')
  mesas(@Query() query: any, @Req() req: any) {
    return this.pedidosService.listaMesas(query, resolveRequestUser(req));
  }

  @Get('carta')
  @RequirePermissions('PEDIDOS', 'ver_pedido')
  carta(@Query() query: any, @Req() req: any) {
    return this.pedidosService.carta(query, resolveRequestUser(req));
  }

  @Get('insumos-mod')
  @RequirePermissions('PEDIDOS', 'ver_pedido')
  insumosMod(@Req() req: any) {
    return this.pedidosService.insumosMod(resolveRequestUser(req));
  }

  @Get('porciones')
  @RequirePermissions('PEDIDOS', 'ver_pedido')
  porciones(@Query() query: any, @Req() req: any) {
    return this.pedidosService.porciones(query, resolveRequestUser(req));
  }

  @Get('activo')
  @RequirePermissions('PEDIDOS', 'ver_pedido')
  activo(@Query() query: any, @Req() req: any) {
    return this.pedidosService.activo(query, resolveRequestUser(req));
  }

  @Get('cocina')
  @RequirePermissions('PEDIDOS', 'ver_cocina')
  cocina(@Query() query: any, @Req() req: any) {
    return this.pedidosService.cocina(query, resolveRequestUser(req));
  }

  @Get('cocina-contexto')
  @RequirePermissions('PEDIDOS', 'ver_cocina')
  cocinaContexto(@Req() req: any) {
    return this.pedidosService.listaSucursales(resolveRequestUser(req));
  }

  @Get()
  @RequirePermissions('PEDIDOS', 'ver_pedido')
  findAll(@Query() query: any, @Req() req: any) {
    return this.pedidosService.findAll(query, resolveRequestUser(req));
  }

  @Get(':id')
  @RequirePermissions('PEDIDOS', 'ver_pedido')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.pedidosService.findOne(Number(id), resolveRequestUser(req));
  }

  @Post()
  @RequirePermissions('PEDIDOS', 'crear_pedido')
  create(@Body() dto: UpsertPedidoDto, @Req() req: any) {
    return this.pedidosService.upsert(null, dto, resolveRequestUser(req));
  }

  @Put(':id')
  @RequirePermissions('PEDIDOS', 'crear_pedido')
  update(@Param('id') id: string, @Body() dto: UpsertPedidoDto, @Req() req: any) {
    return this.pedidosService.upsert(Number(id), dto, resolveRequestUser(req));
  }

  @Post(':id/confirmar')
  @RequirePermissions('PEDIDOS', 'confirmar_pedido')
  confirmar(@Param('id') id: string, @Body() dto: ConfirmarPedidoDto, @Req() req: any) {
    return this.pedidosService.confirmar(Number(id), dto, resolveRequestUser(req));
  }

  @Post(':id/anular')
  @RequirePermissions('PEDIDOS', 'anular_pedido')
  anular(@Param('id') id: string, @Req() req: any) {
    return this.pedidosService.anular(Number(id), resolveRequestUser(req));
  }

  @Patch(':id/items/:idItem/preparacion')
  @RequirePermissions('PEDIDOS', 'actualizar_preparacion')
  preparacion(
    @Param('id') id: string,
    @Param('idItem') idItem: string,
    @Body() dto: CambiarPreparacionDto,
    @Req() req: any,
  ) {
    return this.pedidosService.cambiarPreparacion(Number(id), Number(idItem), dto, resolveRequestUser(req));
  }
}
