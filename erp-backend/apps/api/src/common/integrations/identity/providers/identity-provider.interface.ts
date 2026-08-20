import { IdentityDocumento } from '../identity.interface';

export type IdentityConsultaTipo = 'DNI' | 'RUC';

export interface IIdentityProvider {
  readonly name: string;
  consultar(tipo: IdentityConsultaTipo, numero: string): Promise<IdentityDocumento>;
}
