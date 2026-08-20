import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import { CreateTrasladoDto, RecibirTrasladoDto, RechazarTrasladoDto } from './traslados.dto';
import { TrasladosService } from './traslados.service';

@Controller('traslados')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TrasladosController {
  constructor(private readonly service: TrasladosService) {}

  @Get('catalogos')
  @RequirePermissions('TRASLADOS', 'ver_traslado')
  catalogos(@Req() req: any) {
    return this.service.catalogos(resolveRequestUser(req));
  }

  @Get('stock-origen')
  @RequirePermissions('TRASLADOS', 'ver_traslado')
  stockOrigen(
    @Query('id_insumo') idInsumo: string,
    @Query('id_sucursal') idSucursal: string,
    @Req() req: any,
  ) {
    return this.service.stockOrigen(Number(idInsumo), Number(idSucursal), resolveRequestUser(req));
  }

  @Get()
  @RequirePermissions('TRASLADOS', 'ver_traslado')
  findAll(@Query() query: any, @Req() req: any) {
    return this.service.findAll(query, resolveRequestUser(req));
  }

  @Get(':id')
  @RequirePermissions('TRASLADOS', 'ver_traslado')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(Number(id), resolveRequestUser(req));
  }

  @Post()
  @RequirePermissions('TRASLADOS', 'solicitar_traslado')
  crear(@Body() dto: CreateTrasladoDto, @Req() req: any) {
    return this.service.crear(dto, resolveRequestUser(req));
  }

  @Patch(':id/aprobar')
  @RequirePermissions('TRASLADOS', 'aprobar_traslado')
  aprobar(@Param('id') id: string, @Req() req: any) {
    return this.service.aprobar(Number(id), resolveRequestUser(req));
  }

  @Patch(':id/rechazar')
  @RequirePermissions('TRASLADOS', 'aprobar_traslado')
  rechazar(@Param('id') id: string, @Body() dto: RechazarTrasladoDto, @Req() req: any) {
    return this.service.rechazar(Number(id), dto, resolveRequestUser(req));
  }

  @Patch(':id/despachar')
  @RequirePermissions('TRASLADOS', 'despachar_traslado')
  despachar(@Param('id') id: string, @Req() req: any) {
    return this.service.despachar(Number(id), resolveRequestUser(req));
  }

  @Patch(':id/recibir')
  @RequirePermissions('TRASLADOS', 'recibir_traslado')
  recibir(@Param('id') id: string, @Body() dto: RecibirTrasladoDto, @Req() req: any) {
    return this.service.recibir(Number(id), dto, resolveRequestUser(req));
  }

  @Patch(':id/cancelar')
  @RequirePermissions('TRASLADOS', 'cancelar_traslado')
  cancelar(@Param('id') id: string, @Req() req: any) {
    return this.service.cancelar(Number(id), resolveRequestUser(req));
  }
}
