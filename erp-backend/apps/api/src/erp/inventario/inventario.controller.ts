import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import {
  AjusteInventarioDto,
  CreateMermaDto,
  IngresoInventarioDto,
  IngresoLoteDto,
  SalidaInventarioDto,
  UpdateStockMinimoDto,
} from './inventario.dto';
import { InventarioService } from './inventario.service';

@Controller('inventario')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get('stock')
  @RequirePermissions('INVENTARIO', 'ver_inventario')
  stock(@Query() query: any, @Req() req: any) {
    return this.inventarioService.stock(query, resolveRequestUser(req));
  }

  @Patch('stock/minimo')
  @RequirePermissions('INVENTARIO', 'ajustar_inventario')
  actualizarMinimo(@Body() dto: UpdateStockMinimoDto, @Req() req: any) {
    return this.inventarioService.actualizarMinimo(dto, resolveRequestUser(req));
  }

  @Get('insumos')
  @RequirePermissions('INVENTARIO', 'ver_inventario')
  listaInsumos() {
    return this.inventarioService.listaInsumos();
  }

  @Get('sucursales')
  @RequirePermissions('INVENTARIO', 'ver_inventario')
  listaSucursales(@Req() req: any) {
    return this.inventarioService.listaSucursales(resolveRequestUser(req));
  }

  @Get('motivos-merma')
  @RequirePermissions('INVENTARIO', 'ver_inventario')
  motivosMerma() {
    return this.inventarioService.motivosMerma();
  }

  @Get('lotes')
  @RequirePermissions('INVENTARIO', 'ver_inventario')
  lotes(@Query() query: any, @Req() req: any) {
    return this.inventarioService.lotes(query, resolveRequestUser(req));
  }

  @Post('movimientos/ingreso')
  @RequirePermissions('INVENTARIO', 'crear_movimiento')
  ingreso(@Body() dto: IngresoInventarioDto, @Req() req: any) {
    return this.inventarioService.ingreso(dto, resolveRequestUser(req));
  }

  @Post('movimientos/ingreso-lote')
  @RequirePermissions('INVENTARIO', 'crear_movimiento')
  ingresoLote(@Body() dto: IngresoLoteDto, @Req() req: any) {
    return this.inventarioService.ingresoLote(dto, resolveRequestUser(req));
  }

  @Post('movimientos/salida')
  @RequirePermissions('INVENTARIO', 'crear_movimiento')
  salida(@Body() dto: SalidaInventarioDto, @Req() req: any) {
    return this.inventarioService.salida(dto, resolveRequestUser(req));
  }

  @Post('movimientos/ajuste')
  @RequirePermissions('INVENTARIO', 'ajustar_inventario')
  ajuste(@Body() dto: AjusteInventarioDto, @Req() req: any) {
    return this.inventarioService.ajuste(dto, resolveRequestUser(req));
  }

  @Get('kardex')
  @RequirePermissions('INVENTARIO', 'ver_kardex')
  kardex(@Query() query: any, @Req() req: any) {
    return this.inventarioService.kardex(query, resolveRequestUser(req));
  }

  @Get('mermas/resumen')
  @RequirePermissions('INVENTARIO', 'ver_merma')
  mermasResumen(@Query() query: any, @Req() req: any) {
    return this.inventarioService.mermasResumen(query, resolveRequestUser(req));
  }

  @Get('mermas')
  @RequirePermissions('INVENTARIO', 'ver_merma')
  mermas(@Query() query: any, @Req() req: any) {
    return this.inventarioService.mermas(query, resolveRequestUser(req));
  }

  @Post('mermas')
  @RequirePermissions('INVENTARIO', 'crear_merma')
  crearMerma(@Body() dto: CreateMermaDto, @Req() req: any) {
    return this.inventarioService.crearMerma(dto, resolveRequestUser(req));
  }
}
