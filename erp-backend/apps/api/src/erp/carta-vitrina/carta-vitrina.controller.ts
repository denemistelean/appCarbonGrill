import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { resolveRequestUser } from '../../common/auth/request-user.util';
import { ActualizarVitrinaDto, CrearTagDto, GuardarProductoVitrinaDto } from './carta-vitrina.dto';
import { CartaVitrinaService } from './carta-vitrina.service';

@Controller('carta-vitrina')
export class CartaVitrinaPublicController {
  constructor(private readonly service: CartaVitrinaService) {}

  @Get()
  publica(@Query() query: any) {
    return this.service.publica(query);
  }
}

@Controller('carta-visual')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CartaVitrinaStaffController {
  constructor(private readonly service: CartaVitrinaService) {}

  @Get()
  @RequirePermissions('CARTA', 'ver_carta_visual')
  admin(@Query() query: any, @Req() req: any) {
    return this.service.adminResumen(resolveRequestUser(req), query);
  }

  @Put('config')
  @RequirePermissions('CARTA', 'gestionar_carta_visual')
  config(@Body() dto: ActualizarVitrinaDto, @Query() query: any, @Req() req: any) {
    return this.service.guardarConfig(dto, resolveRequestUser(req), query);
  }

  @Post('tags')
  @RequirePermissions('CARTA', 'gestionar_carta_visual')
  crearTag(@Body() dto: CrearTagDto, @Query() query: any, @Req() req: any) {
    return this.service.crearTag(dto, resolveRequestUser(req), query);
  }

  @Delete('tags/:id')
  @RequirePermissions('CARTA', 'gestionar_carta_visual')
  borrarTag(@Param('id') id: string, @Query() query: any, @Req() req: any) {
    return this.service.eliminarTag(Number(id), resolveRequestUser(req), query);
  }

  @Post('productos')
  @RequirePermissions('CARTA', 'gestionar_carta_visual')
  guardarProducto(@Body() dto: GuardarProductoVitrinaDto, @Query() query: any, @Req() req: any) {
    return this.service.guardarProducto(dto, resolveRequestUser(req), query);
  }

  @Patch('productos/:id/disponible')
  @RequirePermissions('CARTA', 'gestionar_carta_visual')
  toggle(@Param('id') id: string, @Query() query: any, @Req() req: any) {
    return this.service.toggleDisponible(Number(id), resolveRequestUser(req), query);
  }

  @Delete('productos/:id')
  @RequirePermissions('CARTA', 'gestionar_carta_visual')
  quitar(@Param('id') id: string, @Query() query: any, @Req() req: any) {
    return this.service.quitarDeCarta(Number(id), resolveRequestUser(req), query);
  }

  @Patch('productos/:id/visible')
  @RequirePermissions('CARTA', 'gestionar_carta_visual')
  restaurar(@Param('id') id: string, @Query() query: any, @Req() req: any) {
    return this.service.restaurarEnCarta(Number(id), resolveRequestUser(req), query);
  }

  @Post('productos/:id/imagen')
  @RequirePermissions('CARTA', 'gestionar_carta_visual')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  imagen(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Query() query: any, @Req() req: any) {
    return this.service.subirImagen(Number(id), file, resolveRequestUser(req), query);
  }

  @Delete('productos/:id/imagen')
  @RequirePermissions('CARTA', 'gestionar_carta_visual')
  quitarImagen(@Param('id') id: string, @Query() query: any, @Req() req: any) {
    return this.service.quitarImagen(Number(id), resolveRequestUser(req), query);
  }
}
