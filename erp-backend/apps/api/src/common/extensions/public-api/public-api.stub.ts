/**
 * Stub — API REST pública futura.
 * NO registrar en ApiModule hasta implementar autenticación por API key.
 */
export interface IPublicApiGateway {
  /** Listados read-only tipados por recurso. */
  query(resource: string, filters: Record<string, unknown>): Promise<unknown>;
}

/** TODO: implementar gateway real sin mutar dominio. */
export const PUBLIC_API_GATEWAY = Symbol('PUBLIC_API_GATEWAY');
