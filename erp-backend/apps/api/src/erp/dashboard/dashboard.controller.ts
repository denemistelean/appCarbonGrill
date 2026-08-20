import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @RequirePermissions('DASHBOARD', 'ver_dashboard')
  @Get('resumen')
  resumen(@Query() query: any, @Req() req: any) {
    return this.dashboardService.resumen(query, resolveRequestUser(req));
  }
}
