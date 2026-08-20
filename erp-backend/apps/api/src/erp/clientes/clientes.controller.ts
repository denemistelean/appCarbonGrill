import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import { CreateClienteDto, UpdateClienteDto } from './clientes.dto';
import { ClientesService } from './clientes.service';

@Controller('clientes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientesController {
  constructor(private readonly service: ClientesService) {}

  @Get('identity/:tipo/:numero')
  @RequirePermissions('CLIENTES', 'ver_cliente')
  identity(@Param('tipo') tipo: string, @Param('numero') numero: string) {
    return this.service.consultarIdentity(tipo, numero);
  }

  @Get('lista')
  @RequirePermissions('CLIENTES', 'ver_cliente')
  lista(@Query('search') search?: string) {
    return this.service.lista(search);
  }

  @Get()
  @RequirePermissions('CLIENTES', 'ver_cliente')
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('CLIENTES', 'ver_cliente')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Post()
  @RequirePermissions('CLIENTES', 'crear_cliente')
  create(@Body() dto: CreateClienteDto, @Req() req: any) {
    return this.service.create(dto, resolveRequestUser(req).idUsuario);
  }

  @Put(':id')
  @RequirePermissions('CLIENTES', 'actualizar_cliente')
  update(@Param('id') id: string, @Body() dto: UpdateClienteDto, @Req() req: any) {
    return this.service.update(Number(id), dto, resolveRequestUser(req).idUsuario);
  }

  @Delete(':id')
  @RequirePermissions('CLIENTES', 'eliminar_cliente')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(Number(id), resolveRequestUser(req).idUsuario);
  }
}
