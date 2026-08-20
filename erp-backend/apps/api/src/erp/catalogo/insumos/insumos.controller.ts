import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../../common/auth/request-user.util';
import { CreateInsumoDto, UpdateInsumoDto } from './insumos.dto';
import { InsumosService } from './insumos.service';

@Controller('insumos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsumosController {
  constructor(private readonly insumosService: InsumosService) {}

  @Get('lista')
  @RequirePermissions('INSUMOS', 'ver_insumo')
  lista() {
    return this.insumosService.lista();
  }

  @Get('unidades-medida')
  @RequirePermissions('INSUMOS', 'ver_insumo')
  listaUnidades() {
    return this.insumosService.listaUnidades();
  }

  @Get()
  @RequirePermissions('INSUMOS', 'ver_insumo')
  findAll(@Query() query: any) {
    return this.insumosService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('INSUMOS', 'ver_insumo')
  findOne(@Param('id') id: string) {
    return this.insumosService.findOne(Number(id));
  }

  @Post()
  @RequirePermissions('INSUMOS', 'crear_insumo')
  create(@Body() dto: CreateInsumoDto, @Req() req: any) {
    return this.insumosService.create(dto, resolveRequestUser(req).idUsuario);
  }

  @Put(':id')
  @RequirePermissions('INSUMOS', 'actualizar_insumo')
  update(@Param('id') id: string, @Body() dto: UpdateInsumoDto, @Req() req: any) {
    return this.insumosService.update(Number(id), dto, resolveRequestUser(req).idUsuario);
  }

  @Delete(':id')
  @RequirePermissions('INSUMOS', 'eliminar_insumo')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.insumosService.remove(Number(id), resolveRequestUser(req).idUsuario);
  }
}
