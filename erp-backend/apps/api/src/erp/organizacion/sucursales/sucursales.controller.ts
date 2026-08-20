import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../../common/auth/request-user.util';
import { CreateSucursalDto, UpdateSucursalDto } from './sucursales.dto';
import { SucursalesService } from './sucursales.service';

@Controller('sucursales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SucursalesController {
  constructor(private readonly sucursalesService: SucursalesService) {}

  @Get('lista')
  @RequirePermissions('SUCURSALES', 'ver_sucursal')
  lista() {
    return this.sucursalesService.findAll({ page: 1, limit: 100 });
  }

  @Get()
  @RequirePermissions('SUCURSALES', 'ver_sucursal')
  findAll(@Query() query: any) {
    return this.sucursalesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('SUCURSALES', 'ver_sucursal')
  findOne(@Param('id') id: string) {
    return this.sucursalesService.findOne(Number(id));
  }

  @Post()
  @RequirePermissions('SUCURSALES', 'crear_sucursal')
  create(@Body() dto: CreateSucursalDto, @Req() req: any) {
    const user = resolveRequestUser(req);
    return this.sucursalesService.create(dto, user.idUsuario);
  }

  @Put(':id')
  @RequirePermissions('SUCURSALES', 'actualizar_sucursal')
  update(@Param('id') id: string, @Body() dto: UpdateSucursalDto, @Req() req: any) {
    const user = resolveRequestUser(req);
    return this.sucursalesService.update(Number(id), dto, user.idUsuario);
  }

  @Delete(':id')
  @RequirePermissions('SUCURSALES', 'eliminar_sucursal')
  remove(@Param('id') id: string, @Req() req: any) {
    const user = resolveRequestUser(req);
    return this.sucursalesService.remove(Number(id), user.idUsuario);
  }
}
