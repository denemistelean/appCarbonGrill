import { HttpException, HttpStatus } from '@nestjs/common';

export class IdentityProviderBlockedError extends HttpException {
  constructor(message = 'Proveedor de identidad bloqueado o requiere captcha. Reintente más tarde.') {
    super(
      { statusCode: HttpStatus.SERVICE_UNAVAILABLE, message, code: 'IDENTITY_PROVIDER_BLOCKED' },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
