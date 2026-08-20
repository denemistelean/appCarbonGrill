import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { loadIdentityConfig } from '../identity.config';
import { IdentityProviderBlockedError } from '../identity.exceptions';
import { IdentityDocumento } from '../identity.interface';
import { IIdentityProvider, IdentityConsultaTipo } from './identity-provider.interface';

@Injectable()
export class HttpIdentityProvider implements IIdentityProvider {
  readonly name = 'http';
  private readonly logger = new Logger(HttpIdentityProvider.name);

  async consultar(tipo: IdentityConsultaTipo, numero: string): Promise<IdentityDocumento> {
    const cfg = loadIdentityConfig();
    const base = String(cfg.httpUrl || '').replace(/\/$/, '');
    if (!base) {
      throw new ServiceUnavailableException('Identity HTTP no configurado: defina IDENTITY_HTTP_URL');
    }

    const maxAttempts = cfg.retries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.fetchOnce(base, tipo, numero, cfg.timeoutMs);
      } catch (err) {
        if (err instanceof NotFoundException || err instanceof IdentityProviderBlockedError) throw err;
        lastError = err;
        if (attempt < maxAttempts) {
          const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
          this.logger.warn(`Identity HTTP retry ${attempt}/${maxAttempts} en ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    const msg = lastError instanceof Error ? lastError.message : 'Error de red Identity HTTP';
    throw new ServiceUnavailableException(`No se pudo consultar identidad (HTTP): ${msg}`);
  }

  private async fetchOnce(base: string, tipo: IdentityConsultaTipo, numero: string, timeoutMs: number) {
    const controller = new AbortController();
    const ms = Math.max(timeoutMs, 20000);
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(`${base}/consultar`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, numero }),
      });
      const bodyText = await res.text();
      let json: any = {};
      try {
        json = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        json = { mensaje: bodyText };
      }

      if (res.status === 400) throw new ServiceUnavailableException(json.mensaje || 'Validación Identity HTTP');
      if (res.status === 503) {
        const code = String(json.code || '');
        if (code === 'IDENTITY_CAPTCHA' || /captcha/i.test(String(json.mensaje || ''))) {
          throw new IdentityProviderBlockedError(json.mensaje || 'SUNAT requiere captcha. Reintente más tarde.');
        }
        throw new ServiceUnavailableException(json.mensaje || 'Proveedor Identity no disponible');
      }
      if (res.status === 502) throw new ServiceUnavailableException(json.mensaje || 'No se pudo interpretar respuesta SUNAT');
      if (!res.ok) throw new ServiceUnavailableException(`Identity HTTP respondió HTTP ${res.status}`);

      const encontrado = json.encontrado !== false;
      const doc: IdentityDocumento = {
        tipo_documento: tipo,
        numero_documento: numero,
        razon_social: String(json.razon_social || '').trim(),
        nombres: json.nombres ?? null,
        apellidos: json.apellidos ?? null,
        direccion: json.direccion ?? null,
        estado_contribuyente: json.estado_contribuyente ?? null,
        encontrado,
        ruc: json.ruc ?? null,
        nombre_comercial: json.nombre_comercial ?? null,
        condicion_contribuyente: json.condicion_contribuyente ?? null,
        tipo_contribuyente: json.tipo_contribuyente ?? null,
        mensaje: json.mensaje ?? null,
      };
      if (!encontrado) throw new NotFoundException(doc.mensaje || 'Documento no encontrado en SUNAT');
      if (!doc.razon_social && doc.nombre_comercial) doc.razon_social = String(doc.nombre_comercial);
      return doc;
    } catch (err) {
      if (
        err instanceof IdentityProviderBlockedError ||
        err instanceof NotFoundException ||
        err instanceof ServiceUnavailableException
      ) {
        throw err;
      }
      if ((err as any)?.name === 'AbortError') {
        throw new ServiceUnavailableException('Timeout al consultar microservicio Identity');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
