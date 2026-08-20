import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { loadIdentityConfig } from './identity.config';
import { IdentityDocumento, IIdentityService } from './identity.interface';
import { IDENTITY_PROVIDER } from './identity.tokens';
import type { IIdentityProvider } from './providers/identity-provider.interface';
import type { IdentityConsultaTipo } from './providers/identity-provider.interface';

@Injectable()
export class IdentityService implements IIdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly cacheTtlMs: number;

  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly provider: IIdentityProvider,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.cacheTtlMs = loadIdentityConfig().cacheTtlSeconds * 1000;
  }

  consultarDni(dni: string) {
    return this.consultarDocumento('DNI', dni);
  }

  consultarRuc(ruc: string) {
    return this.consultarDocumento('RUC', ruc);
  }

  async consultarDocumento(tipo: string, numero: string): Promise<IdentityDocumento> {
    const tipoNorm = this.normalizeTipo(tipo);
    const numeroNorm = this.normalizeNumero(tipoNorm, numero);
    const cacheKey = `IDENTITY:${tipoNorm}:${numeroNorm}`;
    const started = Date.now();

    const cached = await this.cache.get<IdentityDocumento>(cacheKey);
    if (cached) {
      this.logConsulta(tipoNorm, numeroNorm, true, Date.now() - started);
      return cached;
    }

    const raw = await this.provider.consultar(tipoNorm, numeroNorm);
    const doc = this.normalizeDocumento(tipoNorm, numeroNorm, raw);
    await this.cache.set(cacheKey, doc, this.cacheTtlMs);
    this.logConsulta(tipoNorm, numeroNorm, false, Date.now() - started);
    return doc;
  }

  private normalizeTipo(tipo: string): IdentityConsultaTipo {
    const t = String(tipo || '').trim().toUpperCase();
    if (t === 'DNI' || t === 'RUC') return t;
    throw new BadRequestException('Tipo de documento Identity no soportado (use DNI o RUC)');
  }

  private normalizeNumero(tipo: IdentityConsultaTipo, numero: string) {
    const n = String(numero || '').replace(/\D/g, '');
    if (tipo === 'DNI' && !/^\d{8}$/.test(n)) throw new BadRequestException('DNI inválido: debe tener 8 dígitos');
    if (tipo === 'RUC' && !/^\d{11}$/.test(n)) throw new BadRequestException('RUC inválido: debe tener 11 dígitos');
    return n;
  }

  private normalizeDocumento(tipo: IdentityConsultaTipo, numero: string, raw: IdentityDocumento): IdentityDocumento {
    return {
      tipo_documento: tipo,
      numero_documento: numero,
      razon_social: String(raw.razon_social || raw.nombre_comercial || '').trim().toUpperCase(),
      nombres: raw.nombres ? String(raw.nombres).trim() : null,
      apellidos: raw.apellidos ? String(raw.apellidos).trim() : null,
      direccion: raw.direccion ? String(raw.direccion).trim() : null,
      estado_contribuyente: raw.estado_contribuyente || null,
      encontrado: raw.encontrado !== false,
      ruc: raw.ruc || null,
      nombre_comercial: raw.nombre_comercial ? String(raw.nombre_comercial).trim().toUpperCase() : null,
      condicion_contribuyente: raw.condicion_contribuyente || null,
      tipo_contribuyente: raw.tipo_contribuyente || null,
      mensaje: raw.mensaje || null,
    };
  }

  private logConsulta(tipo: string, numero: string, cacheHit: boolean, durationMs: number) {
    const masked = numero.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, numero.length - 4))}${numero.slice(-4)}`;
    this.logger.log(
      `Identity provider=${this.provider.name} tipo=${tipo} doc=${masked} cache=${cacheHit ? 'HIT' : 'MISS'} ${durationMs}ms`,
    );
  }
}
