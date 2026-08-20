import { Controller, Post, Body, HttpCode, HttpStatus, Delete, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CambiarClaveDto } from './dto/cambiar-clave.dto';
import { JwtAuthGuard } from '@app/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('cambiar-clave')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  cambiarClave(@Body() dto: CambiarClaveDto, @Req() req: any) {
    const userId = Number(req.user?.userId || req.user?.sub || 0);
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    return this.authService.cambiarClave(userId, dto.clave_actual, dto.clave_nueva);
  }

  @Delete('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Req() _req: any) {
    return this.authService.logout();
  }
}
