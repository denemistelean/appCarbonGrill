import { Request, Response, NextFunction } from 'express';

/**
 * Quita espacios al inicio/final de TODOS los query params (?search=, ?term=, etc.)
 * antes de que lleguen a los controllers/services.
 *
 * Por qué existe: al pegar texto (de Excel, WhatsApp, etc.) suele venir con espacios
 * sobrantes; eso rompe los `WHERE columna LIKE '%texto%'` porque la BD no tiene esos
 * espacios en esa posición y la búsqueda no devuelve resultados.
 *
 * OJO: en Express 5 `req.query` es un getter que reparsea la URL en cada acceso
 * (mutar el objeto devuelto NO persiste), así que hay que reemplazar la propiedad
 * con `Object.defineProperty` en vez de asignar/mutar directamente.
 */
function trimDeep(value: any): any {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(trimDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) out[key] = trimDeep(value[key]);
    return out;
  }
  return value;
}

export function trimQueryMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.query && typeof req.query === 'object') {
    const trimmed = trimDeep(req.query);
    Object.defineProperty(req, 'query', { value: trimmed, writable: true, enumerable: true, configurable: true });
  }
  next();
}
