import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../../common/auth/request-user.util';
import { CreateProductoDto, UpdateProductoDto } from './productos.dto';
import { ProductosService } from './productos.service';

@Controller('productos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get('lista')
  @RequirePermissions('PRODUCTOS', 'ver_producto')
  lista(@Query() query: any) {
    return this.productosService.lista(query);
  }

  @Get()
  @RequirePermissions('PRODUCTOS', 'ver_producto')
  findAll(@Query() query: any) {
    return this.productosService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('PRODUCTOS', 'ver_producto')
  findOne(@Param('id') id: string) {
    return this.productosService.findOne(Number(id));
  }

  @Post()
  @RequirePermissions('PRODUCTOS', 'crear_producto')
  create(@Body() dto: CreateProductoDto, @Req() req: any) {
    return this.productosService.create(dto, resolveRequestUser(req).idUsuario);
  }

  @Put(':id')
  @RequirePermissions('PRODUCTOS', 'actualizar_producto')
  update(@Param('id') id: string, @Body() dto: UpdateProductoDto, @Req() req: any) {
    return this.productosService.update(Number(id), dto, resolveRequestUser(req).idUsuario);
  }

  @Delete(':id')
  @RequirePermissions('PRODUCTOS', 'eliminar_producto')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.productosService.remove(Number(id), resolveRequestUser(req).idUsuario);
  }
}
