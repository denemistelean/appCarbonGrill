import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import {
  ActualizarPosicionesDto,
  CambiarEstadoMesaDto,
  CreateMesaDto,
  GuardarSalonMapaDto,
  SepararMesasDto,
  UnirMesasDto,
  UpdateMesaDto,
} from './mesas.dto';
import { MesasService } from './mesas.service';

@Controller('mesas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MesasController {
  constructor(private readonly mesasService: MesasService) {}

  @Get('estados')
  @RequirePermissions('MESAS', 'ver_mesa')
  estados() {
    return this.mesasService.catalogos();
  }

  @Get('sucursales')
  @RequirePermissions('MESAS', 'ver_mesa')
  sucursales(@Req() req: any) {
    return this.mesasService.listaSucursales(resolveRequestUser(req));
  }

  @Get('mapa')
  @RequirePermissions('MESAS', 'ver_mesa')
  mapa(@Query() query: any, @Req() req: any) {
    return this.mesasService.mapa(query, resolveRequestUser(req));
  }

  @Get('plano')
  @RequirePermissions('MESAS', 'ver_mesa')
  async plano(@Query() query: any, @Req() req: any) {
    const user = resolveRequestUser(req);
    const data = await this.mesasService.mapa({ id_sucursal: query.id_sucursal }, user);
    return data.plano;
  }

  @Put('plano')
  @RequirePermissions('MESAS', 'actualizar_mesa')
  guardarPlano(@Body() dto: GuardarSalonMapaDto, @Req() req: any) {
    return this.mesasService.guardarPlano(dto, resolveRequestUser(req));
  }

  @Get('lista')
  @RequirePermissions('MESAS', 'ver_mesa')
  lista(@Query() query: any, @Req() req: any) {
    return this.mesasService.lista(query, resolveRequestUser(req));
  }

  @Get('uniones')
  @RequirePermissions('MESAS', 'ver_mesa')
  uniones(@Query() query: any, @Req() req: any) {
    return this.mesasService.historialUniones(query, resolveRequestUser(req));
  }

  @Get()
  @RequirePermissions('MESAS', 'ver_mesa')
  findAll(@Query() query: any, @Req() req: any) {
    return this.mesasService.findAll(query, resolveRequestUser(req));
  }

  @Get(':id')
  @RequirePermissions('MESAS', 'ver_mesa')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.mesasService.findOne(Number(id), resolveRequestUser(req));
  }

  @Post()
  @RequirePermissions('MESAS', 'crear_mesa')
  create(@Body() dto: CreateMesaDto, @Req() req: any) {
    return this.mesasService.create(dto, resolveRequestUser(req));
  }

  @Put(':id')
  @RequirePermissions('MESAS', 'actualizar_mesa')
  update(@Param('id') id: string, @Body() dto: UpdateMesaDto, @Req() req: any) {
    return this.mesasService.update(Number(id), dto, resolveRequestUser(req));
  }

  @Patch('posiciones')
  @RequirePermissions('MESAS', 'actualizar_mesa')
  actualizarPosiciones(@Body() dto: ActualizarPosicionesDto, @Req() req: any) {
    return this.mesasService.actualizarPosiciones(dto, resolveRequestUser(req));
  }

  @Patch(':id/estado')
  @RequirePermissions('MESAS', 'actualizar_mesa')
  cambiarEstado(@Param('id') id: string, @Body() dto: CambiarEstadoMesaDto, @Req() req: any) {
    return this.mesasService.cambiarEstado(Number(id), dto, resolveRequestUser(req));
  }

  @Post('unir')
  @RequirePermissions('MESAS', 'actualizar_mesa')
  unir(@Body() dto: UnirMesasDto, @Req() req: any) {
    return this.mesasService.unir(dto, resolveRequestUser(req));
  }

  @Post('separar')
  @RequirePermissions('MESAS', 'actualizar_mesa')
  separar(@Body() dto: SepararMesasDto, @Req() req: any) {
    return this.mesasService.separar(dto, resolveRequestUser(req));
  }

  @Delete(':id')
  @RequirePermissions('MESAS', 'eliminar_mesa')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.mesasService.remove(Number(id), resolveRequestUser(req));
  }
}
