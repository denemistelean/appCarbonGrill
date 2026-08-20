export type IdentityDocumento = {
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  nombres?: string | null;
  apellidos?: string | null;
  direccion?: string | null;
  estado_contribuyente?: string | null;
  encontrado?: boolean;
  ruc?: string | null;
  nombre_comercial?: string | null;
  condicion_contribuyente?: string | null;
  tipo_contribuyente?: string | null;
  mensaje?: string | null;
};

export interface IIdentityService {
  consultarDocumento(tipo: string, numero: string): Promise<IdentityDocumento>;
  consultarDni(dni: string): Promise<IdentityDocumento>;
  consultarRuc(ruc: string): Promise<IdentityDocumento>;
}
