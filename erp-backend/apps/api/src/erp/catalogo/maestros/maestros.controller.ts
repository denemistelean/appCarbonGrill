import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../../common/auth/request-user.util';
import {
  CreateCategoriaDto,
  CreatePorcionDto,
  CreateUnidadMedidaDto,
  UpdateCategoriaDto,
  UpdatePorcionDto,
  UpdateUnidadMedidaDto,
} from './maestros.dto';
import { MaestrosService } from './maestros.service';

@Controller('catalogo')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MaestrosController {
  constructor(private readonly maestrosService: MaestrosService) {}

  @Get('unidades-medida/lista')
  @RequirePermissions('PRODUCTOS', 'ver_producto')
  listaUnidades() {
    return this.maestrosService.lista('unidades-medida');
  }

  @Get('unidades-medida')
  @RequirePermissions('PRODUCTOS', 'ver_producto')
  findUnidades(@Query() query: any) {
    return this.maestrosService.findAll('unidades-medida', query);
  }

  @Post('unidades-medida')
  @RequirePermissions('PRODUCTOS', 'crear_producto')
  createUnidad(@Body() dto: CreateUnidadMedidaDto, @Req() req: any) {
    return this.maestrosService.create('unidades-medida', dto, resolveRequestUser(req).idUsuario);
  }

  @Put('unidades-medida/:id')
  @RequirePermissions('PRODUCTOS', 'actualizar_producto')
  updateUnidad(@Param('id') id: string, @Body() dto: UpdateUnidadMedidaDto, @Req() req: any) {
    return this.maestrosService.update('unidades-medida', Number(id), dto, resolveRequestUser(req).idUsuario);
  }

  @Delete('unidades-medida/:id')
  @RequirePermissions('PRODUCTOS', 'eliminar_producto')
  removeUnidad(@Param('id') id: string, @Req() req: any) {
    return this.maestrosService.remove('unidades-medida', Number(id), resolveRequestUser(req).idUsuario);
  }

  @Get('categorias/lista')
  @RequirePermissions('PRODUCTOS', 'ver_producto')
  listaCategorias() {
    return this.maestrosService.lista('categorias');
  }

  @Get('categorias')
  @RequirePermissions('PRODUCTOS', 'ver_producto')
  findCategorias(@Query() query: any) {
    return this.maestrosService.findAll('categorias', query);
  }

  @Post('categorias')
  @RequirePermissions('PRODUCTOS', 'crear_producto')
  createCategoria(@Body() dto: CreateCategoriaDto, @Req() req: any) {
    return this.maestrosService.create('categorias', dto, resolveRequestUser(req).idUsuario);
  }

  @Put('categorias/:id')
  @RequirePermissions('PRODUCTOS', 'actualizar_producto')
  updateCategoria(@Param('id') id: string, @Body() dto: UpdateCategoriaDto, @Req() req: any) {
    return this.maestrosService.update('categorias', Number(id), dto, resolveRequestUser(req).idUsuario);
  }

  @Delete('categorias/:id')
  @RequirePermissions('PRODUCTOS', 'eliminar_producto')
  removeCategoria(@Param('id') id: string, @Req() req: any) {
    return this.maestrosService.remove('categorias', Number(id), resolveRequestUser(req).idUsuario);
  }

  @Get('porciones/lista')
  @RequirePermissions('PRODUCTOS', 'ver_producto')
  listaPorciones() {
    return this.maestrosService.lista('porciones');
  }

  @Get('porciones')
  @RequirePermissions('PRODUCTOS', 'ver_producto')
  findPorciones(@Query() query: any) {
    return this.maestrosService.findAll('porciones', query);
  }

  @Post('porciones')
  @RequirePermissions('PRODUCTOS', 'crear_producto')
  createPorcion(@Body() dto: CreatePorcionDto, @Req() req: any) {
    return this.maestrosService.create('porciones', dto, resolveRequestUser(req).idUsuario);
  }

  @Put('porciones/:id')
  @RequirePermissions('PRODUCTOS', 'actualizar_producto')
  updatePorcion(@Param('id') id: string, @Body() dto: UpdatePorcionDto, @Req() req: any) {
    return this.maestrosService.update('porciones', Number(id), dto, resolveRequestUser(req).idUsuario);
  }

  @Delete('porciones/:id')
  @RequirePermissions('PRODUCTOS', 'eliminar_producto')
  removePorcion(@Param('id') id: string, @Req() req: any) {
    return this.maestrosService.remove('porciones', Number(id), resolveRequestUser(req).idUsuario);
  }
}
