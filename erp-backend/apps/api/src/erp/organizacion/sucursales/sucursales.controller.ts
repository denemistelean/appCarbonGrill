import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

  @Post(':id/logo')
  @RequirePermissions('SUCURSALES', 'actualizar_sucursal')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    const user = resolveRequestUser(req);
    return this.sucursalesService.uploadLogo(Number(id), file, user.idUsuario);
  }

  @Delete(':id/logo')
  @RequirePermissions('SUCURSALES', 'actualizar_sucursal')
  removeLogo(@Param('id') id: string, @Req() req: any) {
    const user = resolveRequestUser(req);
    return this.sucursalesService.removeLogo(Number(id), user.idUsuario);
  }
}
