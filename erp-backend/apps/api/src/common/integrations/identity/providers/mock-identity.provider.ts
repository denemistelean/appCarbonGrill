import { Injectable } from '@nestjs/common';
import { IdentityDocumento } from '../identity.interface';
import { IIdentityProvider, IdentityConsultaTipo } from './identity-provider.interface';

@Injectable()
export class MockIdentityProvider implements IIdentityProvider {
  readonly name = 'mock';

  async consultar(tipo: IdentityConsultaTipo, numero: string): Promise<IdentityDocumento> {
    const suffix = numero.slice(-4).padStart(4, '0');
    const isRuc = tipo === 'RUC';
    return {
      tipo_documento: tipo,
      numero_documento: numero,
      razon_social: isRuc ? `EMPRESA MOCK ${suffix}` : `CLIENTE MOCK ${suffix}`,
      nombres: isRuc ? null : `NOMBRE ${suffix}`,
      apellidos: isRuc ? null : `APELLIDO ${suffix}`,
      direccion: isRuc ? `AV. MOCK ${suffix}` : null,
      estado_contribuyente: isRuc ? 'ACTIVO' : null,
      encontrado: true,
    };
  }
}
