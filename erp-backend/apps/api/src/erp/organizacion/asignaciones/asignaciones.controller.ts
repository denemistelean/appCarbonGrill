import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../../common/auth/request-user.util';
import { CreateAsignacionDto } from './asignaciones.dto';
import { AsignacionesService } from './asignaciones.service';

@Controller('personal')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AsignacionesController {
  constructor(private readonly asignacionesService: AsignacionesService) {}

  @Get()
  @RequirePermissions('PERSONAL', 'ver_personal')
  findAll(@Query() query: any) {
    return this.asignacionesService.findAll(query);
  }

  @Get('roles-operativos')
  @RequirePermissions('PERSONAL', 'ver_personal')
  rolesOperativos() {
    return this.asignacionesService.rolesOperativos();
  }

  @Get(':idUsuario/historial')
  @RequirePermissions('PERSONAL', 'ver_historial_personal')
  historial(@Param('idUsuario') idUsuario: string) {
    return this.asignacionesService.historial(Number(idUsuario));
  }

  @Post()
  @RequirePermissions('PERSONAL', 'asignar_personal')
  asignar(@Body() dto: CreateAsignacionDto, @Req() req: any) {
    const user = resolveRequestUser(req);
    return this.asignacionesService.asignar(dto, user.idUsuario);
  }
}
