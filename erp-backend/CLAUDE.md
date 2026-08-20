# CLAUDE.md

> **⚠️ TODO el contenido de este archivo es OBLIGATORIO.** Antes de dar por terminado cualquier módulo, repasa cada sección y el checklist completo. No hay reglas opcionales aquí.

---

## 1. Stack

- **Backend**: NestJS · `apps/<nombre-api>/src/modules/<area>/<feature>/`
  - Estructura PLANA: `.dto.ts` + `.service.ts` + `.controller.ts` + `.module.ts`
  - SQL crudo vía `DataSource` — sin entidades TypeORM, sin Swagger.
- **Frontend**: Angular standalone + signals + OnPush · `<nombre-frontend>/src/app/features/<modulo>/`
  - Estructura por módulo: `<modulo>/<modulo>.ts` + `<modulo>.html` + `<modulo>.service.ts` (plana, sin carpetas internas salvo sub-vistas complejas)
  - Rutas: `<modulo>.routes.ts` · Menú/sidebar: `core/layout/sidebar/sidebar.ts`
  - ⚠️ **Standalone components**: todo componente/pipe/directive usado en la template debe estar en el array `imports: []` del decorador `@Component`. Olvidarlo produce errores `NG0302` o que el elemento se renderiza vacío. Mínimo habitual: `[ReactiveFormsModule, NgSelectModule, DatePipe, DecimalPipe, NgbModalModule, NgbTooltipModule, ...SharedComponents]`. **No usar `CommonModule`** — está deprecado en Angular 17 standalone; con `@if`/`@for` no se necesita ningún import para flujo de control.
  - **Rutas lazy con `loadComponent`** — cada módulo carga su componente bajo demanda (`loadComponent: () => import('./x/x').then(m => m.X)`), no en el bundle inicial.
  - **Presupuesto de bundle (`angular.json` → `budgets`)** — si un componente importa una librería pesada directo en el `imports` de un componente que carga siempre, infla el bundle inicial. Verificar con `ng build --stats-json` + `webpack-bundle-analyzer` si el build empieza a tardar o el bundle inicial supera ~2MB; mover esas dependencias a un componente cargado con `@defer` o a una ruta lazy aparte.

---

## 2. Base de Datos

- MariaDB · configurar BD en variables de entorno (ver sección 4)
- **Variables de entorno**: nunca subir valores reales · variable nueva → agregar en `.env` Y `.env.example`
- **`ALTER TABLE` en producción — cuidado con tablas grandes**: agregar columnas nuevas siempre con `DEFAULT` explícito, probar el tiempo del `ALTER` en staging antes de correrlo en producción, y nunca correrlo en horario de operación activa de los usuarios.

---

## 3. Patrones Backend

| Patrón | Regla |
|--------|-------|
| DTOs | `class-validator` + `class-transformer` · `UpdateXDto extends PartialType(CreateXDto)` · Para objetos anidados: `@ValidateNested() @Type(() => ItemDto) items: ItemDto` — sin `@Type()`, `class-transformer` no instancia la clase y `class-validator` no valida las propiedades internas |
| `Number()` vs `parseInt()` | `parseInt('10abc')` = `10` (ignora el resto silenciosamente). `Number('10abc')` = `NaN`. Para IDs y params numéricos del usuario, siempre `Number()` — más estricto y detecta strings con caracteres extra |
| Usuario logueado | `@Req() req: any` → `req.user.idUsuario` (sin fallback `\|\| 1` — ver regla de seguridad en "autenticación y sesión") |
| Transacciones | Patrón completo obligatorio — sin `catch+rollback` los cambios parciales quedan grabados: `try { ...queries...; await qr.commitTransaction(); } catch(e) { await qr.rollbackTransaction(); throw e; } finally { await qr.release(); }` |
| Paginación | `page/limit` → `offset=(page-1)*limit` · contar en `Promise.all` · retornar `{ data, meta: { total, page, limit } }` |
| Filtros SQL | Siempre placeholders `?` — nunca interpolar valores de usuario en el SQL |
| Soft delete | Siempre `UPDATE estado=0` — nunca `DELETE` |
| Restaurar registro eliminado | Si el módulo necesita "papelera"/restaurar: endpoint `@Patch(':id/restaurar')` con permiso propio `restaurar_x`, `UPDATE tabla SET estado=1, id_usuario_mod=? WHERE id=? AND estado=0`. Verificar `affectedRows`. Auditar como acción `REVERTIR` |
| Registros activos | Todo `SELECT` **y todo `UPDATE`** de datos operativos deben incluir `AND estado = 1` en el `WHERE`. En SELECT: evita devolver borrados. En UPDATE: evita modificar un registro ya eliminado |
| Excepciones | `NotFoundException` → registro no encontrado · `BadRequestException` → validación de negocio fallida · `ConflictException` → duplicado o dependencia activa · En `catch` de transacciones: **`throw e`** (re-throw) — nunca `throw new InternalServerErrorException()` que destruye el tipo de excepción original |
| DTOs — validación completa | Todo DTO debe validar rango y formato, no solo tipo: `@IsPositive() monto: number` (rechaza 0 y negativos) · `@Min(0) cantidad` (permite 0) · `@IsDateString() fecha: string` · `@IsInt() @Min(1) id_x: number` · `@MaxLength(255) nombre: string` |
| ORDER BY dinámico | `ORDER BY` no admite placeholders `?` — si el usuario elige columna, usar whitelist: `const COLS_ALLOWED = ['nombre','fecha']; const col = COLS_ALLOWED.includes(query.sort) ? query.sort : 'id'; ... ORDER BY ${col} DESC` |
| Descargas (Excel/PDF) | Endpoints con `@Res() res: Response` deshabilitan el `TransformInterceptor` — el service escribe directo al response y llama `res.end()`. El frontend no recibe `{ success, data }`, recibe el binario. No retornar nada desde el controller. |
| Auditoría | `auditoriaService.registrar(tabla, id, accion, userId, oldValues, newValues)` · Para `ACTUALIZAR`/`ELIMINAR`: **SELECT old values ANTES del UPDATE/DELETE** · Para `CREAR`: `oldValues = null` · Para `ELIMINAR`/`ANULAR`: `newValues = null` |
| Acciones auditoría | Solo: `CREAR \| ACTUALIZAR \| ELIMINAR \| ANULAR \| REVERTIR` (más las que defina el proyecto) |
| Trazabilidad | Solo `id_usuario_crea` / `id_usuario_mod` — NUNCA `created_at` / `updated_at` / `updated_by`. Patrón: `INSERT (..., id_usuario_crea) VALUES (..., ?)` · `UPDATE ... SET campo=?, id_usuario_mod=? WHERE id=?` |
| Transacción vs query directo | Una sola escritura → `dataSource.query()` directo. Dos o más escrituras que deben ser atómicas → `createQueryRunner()` con `startTransaction/commit/rollback` |
| ⚠️ `qr.query()` dentro de transacción | **CRÍTICO**: dentro de un `QueryRunner`, TODAS las queries deben usar `qr.query()` — NUNCA `this.dataSource.query()`. El `dataSource` abre su propia conexión y corre fuera de la transacción (auto-commit). Si mezclas ambos, el rollback no deshace las queries del `dataSource`. |
| `@Put` vs `@Patch` | `@Put(':id')` = reemplazar el recurso completo (todos los campos del DTO). `@Patch(':id')` = actualización parcial o acción puntual (cambiar estado, cerrar, toggle). |
| Archivos | Guardar ruta RELATIVA en BD (`uploads/modulo/...`); frontend arma URL con `environment.uploadsUrl + ruta` |
| PDF | `PdfService.generarPdf(html, nombreArchivo, res)` |
| Excel | `ExcelService.generarExcel(columnas, data, nombreArchivo, nombreHoja, res)` · `columnas: { header, key, width? }[]` · Si el reporte necesita múltiples hojas, celdas combinadas o formato avanzado, usar `ExcelJS` directo |
| Export grande — streaming, no buffer completo | `ExcelJS.Workbook` por defecto construye el archivo entero en memoria. Para reportes que crecen (>5000 filas reales), usar `new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res })` que escribe fila por fila directo al response sin acumular en RAM |
| Services | Cada módulo usa SOLO su propio service — nunca inyectar el service de otro módulo |
| `findOne` — destructurar siempre | `const row = await this.dataSource.query('SELECT ... WHERE id=?', [id])` retorna un **array**. Siempre destructurar: `const [row] = await ...` — así `row` es `undefined` cuando no hay resultado y `if (!row) throw new NotFoundException(...)` funciona |
| Service retorna datos planos | El service nunca envuelve su retorno en `{ success: true, data: ... }` — eso lo hace el `TransformInterceptor` automáticamente. |
| HTTP Parameter Pollution | `GET /x?id=1&id=2` — Express parsea como `query.id = ['1','2']` (array). `Number(['1','2'])` da `NaN`. Validar: `if (Array.isArray(query.id)) throw new BadRequestException('Param inválido')` |
| Validar `ENUM` antes de `INSERT`/`UPDATE` | Si una columna es `ENUM('A','B')` y el DTO acepta el valor como `string` libre, un valor fuera del enum lanza error 500 genérico. Validar en el DTO con `@IsIn(['A','B'])` para que el rechazo sea un 400 claro |
| IDOR — verificar pertenencia, no solo existencia | `findOne(id)`/`update(id)` que solo validan `WHERE id = ?` permiten que un usuario edite/vea registros de otro tenant. Si la entidad tiene scope (empresa, cliente, etc.), el `WHERE` debe incluir esa columna de scope tomada del `req.user` |
| `DECIMAL`, nunca `FLOAT`/`DOUBLE` para montos | `FLOAT`/`DOUBLE` son de precisión aproximada. Toda columna de dinero debe ser `DECIMAL(10,2)` (o la precisión que corresponda) |
| Pool de conexiones — `connectionLimit` | El `qr.release()` SIEMPRE en `finally`, nunca solo al final del `try`. Sin esto el pool se agota con `ER_CON_COUNT_ERROR` |
| `exports: []` en el `Module` | Un `@Injectable()` listado solo en `providers: []` NO puede inyectarse en otro módulo. Listarlo también en `exports: []`. Aplica a servicios transversales (`AuditoriaService`, `ExcelService`, `PdfService`) |
| `forwardRef()` solo si es estrictamente necesario | Señal de diseño donde dos módulos están demasiado acoplados. Evaluar si la lógica debe vivir en un tercer módulo común |

### Seguridad SQL — reglas obligatorias

| Regla | Detalle |
|-------|---------|
| **Placeholders siempre** | `?` para todo valor de usuario — nunca `${variable}` en el SQL salvo columnas/tablas (que deben venir de whitelist) |
| **No `SELECT *` en listados** | `findAll` y buscadores: columnas explícitas. `findOne` (detalle completo): `SELECT tabla.*` es aceptable |
| **INSERT con columnas explícitas** | `INSERT INTO tabla (col1, col2) VALUES (?, ?)` — nunca `INSERT INTO tabla SET ?` con objeto del usuario; esto es mass-assignment |
| **`@Query()` params siempre llegan como `string`** | `@Query('page') page: number` NO convierte automáticamente. Para `@Query() query: any`, SIEMPRE convertir: `Number(query.page)`. `@Param('id', ParseIntPipe)` sí convierte y valida |
| **Validar params numéricos** | `const id = Number(param); if (!id \|\| isNaN(id)) throw new BadRequestException('ID inválido')` |
| **Totales recalculados en backend** | Nunca confiar en `monto_total` del frontend — siempre recalcular y comparar. Si difieren → `BadRequestException('Alerta de seguridad: totales no coinciden')` |
| **Datos sensibles fuera de auditoría** | Si la entidad tiene `password`, `token`, `pin` → excluirlos antes de llamar `registrar`: `const { password, ...safeData } = entity` |
| **Verificar `affectedRows` tras UPDATE/soft-DELETE** | Si `res.affectedRows === 0` → `throw new NotFoundException('Registro no encontrado o ya eliminado')` |
| **`affectedRows` vs `changedRows`** | `affectedRows`: filas que coincidieron con el WHERE. `changedRows`: filas donde el valor realmente cambió. Para "¿existe el registro?" → `affectedRows` |
| **`Number(null)` da `0`, no `NaN`** | Asegurarse de que las PKs siempre empiezan en 1 (auto_increment por defecto), nunca usar 0 como ID real |
| **Trim en campos de texto del body** | El middleware global solo recorta query params. En POST/PUT, recortar manualmente: `const nombre = String(data.nombre \|\| '').trim().toUpperCase()` |
| **Extraer solo campos conocidos de `body: any`** | Nunca pasar `body` directo a una query. Extraer explícitamente: `const { campo1, campo2 } = data` — evita mass-assignment |

### Seguridad — autenticación y sesión

| Regla | Detalle |
|-------|---------|
| **`bcrypt` con mínimo 10 rounds** | `await bcrypt.hash(password, 10)`. Nunca guardar password en texto plano ni con `md5`/`sha1` |
| **JWT — expiración corta + refresh token** | Access token: `expiresIn: '1h'` típico. Refresh token de vida más larga guardado en httpOnly cookie |
| **Nunca loguear el password ni el token completo** | Loguear solo `email` o `idUsuario` en intentos de login |
| **Rate limit estricto en `/auth/login`** | `@Throttle({ default: { limit: 5, ttl: 60000 } })` — el guard global ya protege, pero login necesita límite más estricto |
| **Helmet con CSP explícito** | Si el frontend carga scripts de CDNs externos, actualizar `contentSecurityPolicy` en `main.ts` cuando se agrega un nuevo CDN |
| **CSRF — bajo riesgo con JWT bearer** | Como el JWT se envía en header `Authorization: Bearer`, el riesgo clásico de CSRF no aplica. Si se usa cookie httpOnly para refresh, agregar `SameSite=Strict` |
| **Nombre de archivo en `Content-Disposition` — sanitizar** | `filename.replace(/[^a-zA-Z0-9_\-.]/g, '_')` antes de usarlo en el header |
| **Sesión inválida — propagar a otras pestañas** | Al hacer logout, escribir una key en `localStorage` y escuchar el evento `storage` en otras pestañas |
| **Nunca usar `req.user?.idUsuario \|\| 1`** | Si el `JwtAuthGuard` pasó, `req.user.idUsuario` siempre debe existir. `\|\| 1` oculta un fallo real del guard. Patrón correcto: `req.user.idUsuario` directo (sin fallback) |

### SQL — errores silenciosos frecuentes

| Caso | Error | Corrección |
|------|-------|------------|
| **`LIKE '%?%'`** | El `?` dentro de comillas es literal | `WHERE nombre LIKE ?` con param `['%' + search + '%']` |
| **`WHERE id IN (?)` con array vacío** | Genera `IN ()` → error de sintaxis | `if (ids.length === 0) return []` |
| **`null` en placeholder de igualdad** | `WHERE id = null` no coincide nada | Validar que el param no sea `null`/`undefined`; si es opcional, construir la cláusula dinámicamente |
| **Campos opcionales de texto** | `''` en BD es más difícil de filtrar que `NULL` | `const campo = data.campo?.trim() \|\| null` |
| **`BETWEEN` con `DATETIME` pierde el último día** | `<= '2024-01-31'` es `<= '2024-01-31 00:00:00'` | `WHERE fecha >= ? AND fecha < DATE_ADD(?, INTERVAL 1 DAY)` |
| **`CONCAT` con NULL** | `CONCAT(nombre, ' ', apellido)` devuelve `NULL` si alguno es `NULL` | Usar `CONCAT_WS(' ', nombre, apellido)` |
| **`estado=1` en condición JOIN** | Si un catálogo fue borrado, el JOIN devuelve `NULL` para sus campos | `LEFT JOIN cat_tipo t ON t.id = x.id_tipo AND t.estado = 1` |
| **`GROUP_CONCAT` se trunca a 1024 bytes** | Sin advertencia, el resultado queda incompleto | `SET SESSION group_concat_max_len = 100000` o usar `JSON_ARRAYAGG` |
| **`CHAR_LENGTH` vs `LENGTH`** | `LENGTH('ñ')` = 2 bytes · `CHAR_LENGTH('ñ')` = 1 char | Para límites visibles al usuario usar `CHAR_LENGTH` |
| **`COUNT(*)` vs `COUNT(campo)`** | `COUNT(campo)` cuenta solo filas donde `campo` no es NULL | Para contar registros de la tabla principal usar `COUNT(*)` |
| **CTE (`WITH`) para queries complejas** | Subqueries anidadas ilegibles | `WITH totales AS (SELECT ...) SELECT ... FROM ... LEFT JOIN totales` (MariaDB 10.2+) |
| **Path traversal en subida de archivos** | `fs.writeFile(path + filename)` con nombre del usuario | Generar nombre con `uuid()` + extensión validada; nunca usar el nombre original para guardar en disco |
| **Re-throw en catch de transacción** | `throw new InternalServerErrorException()` destruye el tipo original | `throw e` (re-throw del original) |
| **`SP SIGNAL SQLSTATE '45000'`** | El `DatabaseExceptionFilter` devuelve 500 sin mensaje | `catch(e) { if (e.sqlState === '45000') throw new BadRequestException(e.message); throw e; }` |
| **`NULLIF` para división segura** | `monto / 0` lanza error | `monto / NULLIF(cantidad, 0)` devuelve `NULL` en vez de error |
| **`COALESCE(SUM(monto), 0)`** | `SUM` en vacío da `NULL`, no `0` | Siempre `COALESCE(SUM(monto), 0) AS total` |
| **Funciones en `WHERE` invalidan el índice** | `WHERE DATE(fecha) = ?` impide usar el índice | `WHERE fecha >= '2024-01-01' AND fecha < '2025-01-01'` |
| **Aritmética de punto flotante en montos** | `0.1 + 0.2 = 0.30000000000000004` | `Math.round(total * 100) / 100` o calcular el total en SQL con `SUM(monto)` |
| **DTO validation message es array** | `err.error.message` puede ser array | `const msg = Array.isArray(err.error.message) ? err.error.message[0] : err.error.message` |
| **`DECIMAL` llega como string del driver** | MariaDB devuelve columnas `DECIMAL` como strings | `const monto = Number(row.monto)` antes de cualquier cálculo |
| **`ParseIntPipe` en `@Query()` opcional** | Lanza 400 si el param no se envía | Para query params numéricos opcionales: `@Query('id') id?: string`, luego `id ? Number(id) : undefined` |
| **Fechas de trazabilidad siempre con `NOW()`** | El usuario puede enviar cualquier fecha | Hardcodear en SQL: `INSERT (..., fecha_crea) VALUES (..., NOW())` |
| **`@IsOptional()` solo no valida vacío** | Acepta string vacío `""` | Añadir `@IsNotEmpty()` junto a `@IsOptional()`: `@IsOptional() @IsNotEmpty() @IsString()` |
| **`PartialType(CreateDto)` para UpdateDto** | Duplicar todos los decoradores | `export class UpdateXDto extends PartialType(CreateXDto) {}` |
| **`@Transform` para coerción de tipos en DTO** | Sin `@Type()`, un campo `precio: number` sigue siendo string si viene de `@Query()` | `@Transform(({ value }) => [].concat(value).map(Number))` para arrays de IDs |
| **UTF-8 `utf8mb4`** | Columnas `utf8` truncan emojis y caracteres especiales silenciosamente | Verificar `SHOW CREATE TABLE`; agregar `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` |
| **`console.log` prohibido en backend** | Usar Winston vía `Logger`. `console.log` va a stdout sin nivel ni contexto | `this.logger.log(msg)`, `this.logger.error(msg, err.stack)`, `this.logger.warn(msg)` |
| **`RETURNING` no existe en MariaDB** | Solo Postgres lo tiene | `const res = await this.dataSource.query('INSERT INTO ...'); const newId = Number(res.insertId)` |
| **`ON DUPLICATE KEY UPDATE` para upsert** | El patrón SELECT → INSERT/UPDATE tiene race condition | `INSERT INTO t (col1, col2) VALUES (?, ?) ON DUPLICATE KEY UPDATE col2 = VALUES(col2), fecha_update = NOW()` |
| **Dynamic `ORDER BY` — solo whitelist** | `ORDER BY ${query.sortCol}` es inyección SQL directa | `const COLS = { fecha: 't.fecha', nombre: 't.nombre' }; const col = COLS[query.sortCol] ?? 't.id'` |
| **`TIMESTAMP` vs `DATETIME` — zona horaria** | `TIMESTAMP` almacena UTC y convierte al timezone del servidor al leer | Usar `DATETIME` para fechas del negocio; `TIMESTAMP` solo para `created_at`/`updated_at` automáticos |
| **`undefined` en array de params → bug silencioso** | El driver lo convierte a string `"undefined"` o `NULL`; la query no falla pero devuelve 0 filas | Validar cada param antes: `if (!someVar) throw new BadRequestException(...)` |
| **Deadlock en transacciones** | Dos transacciones acceden a mismas tablas en orden inverso | Siempre acceder a las tablas en el mismo orden. Capturar `ER_LOCK_DEADLOCK` y relanzar como `ConflictException('Conflicto de concurrencia, reintente')` |
| **`WHERE ... AND estado = 1` también en subqueries** | El `WHERE` del query principal no filtra hacia subqueries y CTEs | Verificar cada `SELECT`, subquery y CTE por separado |
| **`ROW_NUMBER()` para numerar filas en reportes** | MariaDB 10.2+ soporta window functions | `ROW_NUMBER() OVER (ORDER BY fecha DESC) AS nro` — útil para numeración correlativa en PDFs/Excel |
| **`IF()` vs `CASE WHEN`** | `IF` solo para 1 condición binaria | `CASE WHEN` para múltiples ramas (≥ 3) o condiciones no binarias |
| **Multer para subida de archivos** | Sin límite de fileSize, un usuario puede subir 1 GB | `limits: { fileSize: 5 * 1024 * 1024 }` + `fileFilter` por mimetype + nombre generado con `uuid()` |
| **Importación masiva desde Excel** | Abortar en el primer error obliga al usuario a corregir una fila a la vez | Procesar fila por fila, acumular errores, devolver `{ exitosas, fallidas: { fila, motivo }[] }` |
| **`SELECT FOR UPDATE` para bloqueo pesimista** | Dos requests pueden editar el mismo registro simultáneamente | `qr.query('SELECT id FROM tabla WHERE id = ? FOR UPDATE', [id])` dentro de la transacción |
| **`@Throttle` para rate limiting** | Sin límite, un usuario puede exportar Excel 100 veces por segundo | `@Throttle({ default: { limit: 5, ttl: 60000 } })` en endpoints de exportación o costosos |
| **`DATEDIFF` / `TIMESTAMPDIFF` para fechas en SQL** | Calcular diferencias de fechas en JavaScript es propenso a errores de DST | `DATEDIFF(fecha_fin, fecha_inicio)` · `TIMESTAMPDIFF(HOUR, inicio, fin)` |
| **`DATE_FORMAT` en SQL vs Angular DatePipe** | Formatear en SQL devuelve string que no se puede filtrar ni ordenar | Formatear fechas en el **frontend** con `\| date:'dd/MM/yyyy'`. Excepción: reportes Excel/PDF |
| **`EXPLAIN` para queries lentas** | `findAll` lento sin saber por qué | `EXPLAIN SELECT ...` — si `type=ALL` y la tabla tiene >10k filas, agregar índice en columna del WHERE |
| **`@Exclude()` para campos sensibles en respuestas** | Campos como `password_hash` pueden salir en la API | No incluir columnas sensibles en el `SELECT` de la query — si no están en el resultado, no se filtran |

### Performance — reglas obligatorias

| Regla | Detalle |
|-------|---------|
| **Sin N+1 queries** | Nunca hacer queries dentro de un loop de resultados. Usar `JOIN` o batch con `WHERE id IN (...)` |
| **`Promise.all` para llamadas independientes** | `const [a, b, c] = await Promise.all([query1, query2, query3])` |
| **LIMIT en todo buscador** | Combos/ng-select: `LIMIT 20-50` · Export: `LIMIT 5000` · `findAll`: paginado. Nunca query sin límite en endpoint público |
| **Solo columnas necesarias en JOINs pesados** | Seleccionar solo las columnas que el frontend realmente usa |
| **Services son singletons — no guardar estado de request** | Nunca `this.algoCacheado = resultado` — el siguiente request leerá datos del anterior |
| **`INSERT INTO ... SELECT` para duplicar registros** | Más eficiente que `SELECT` + `INSERT` separados y sin race conditions. Excluir siempre el PK y campos de trazabilidad |
| **`FIELD()` para ordenamiento personalizado** | `ORDER BY FIELD(estado, 'PENDIENTE', 'EN_PROCESO', 'PAGADO', 'ANULADO')` — ordena por secuencia lógica del negocio |
| **`INSERT` múltiple con varios `VALUES`** | Nunca N `INSERT` separados en un loop. Construir un solo `INSERT INTO t (a,b,c) VALUES (?,?,?), (?,?,?),...` |
| **`app.enableShutdownHooks()` para cierre limpio** | Sin esto, al reiniciar las conexiones del pool no se cierran ordenadamente |

---

### Endpoints de búsqueda con LIMIT (`buscar/<entidad>`)

Todo endpoint de búsqueda que use `LIMIT N` y cuyo resultado se precargue en un `ng-select` de edición **debe priorizar el ID exacto**. Si el registro ya guardado tiene un ID que no entra en los primeros N resultados, el dropdown aparece vacío al abrir el formulario de edición.

Patrón obligatorio:

```ts
let orderBy = 'ORDER BY t.id_xxx DESC';
if (exactId > 0) {
    orderBy = 'ORDER BY CASE WHEN t.id_xxx = ? THEN 0 ELSE 1 END, t.id_xxx DESC';
    params.push(exactId);
}
```

Dos variantes según cómo llega el ID:

**Variante A — el `search` puede ser un número** (el frontend busca por texto que puede ser el ID):
```ts
const exactId = !isNaN(Number(search)) ? Number(search) : 0;
```

**Variante B — param `?id=` separado** (el frontend precarga por ID directo):
```ts
async buscarEntidad(search: string, id?: number) {
    const exactId = id || 0;
}
```

- El LIMIT sigue igual — solo cambia el orden para que el exacto siempre salga primero

### Stored Procedures — `sp_{entidad}_{accion}`

- **Status codes**:
  `OK` → continuar · `NOT_FOUND` → `NotFoundException` · `DUPLICATE` → `ConflictException` · `LOCKED` → `ConflictException("modificado por otro usuario")` · `HAS_X` → `ConflictException`
- Paginación con `p_limit`/`p_offset`, dynamic SQL con `PREPARE/EXECUTE`
- Optimistic locking: `WHERE id=? AND version=? AND estado=1`; si `ROW_COUNT()=0` → retorna `LOCKED`
- UPDATE/DELETE: guardar valores anteriores con `SELECT INTO v_old_*` antes de modificar
- **`CALL proc()` devuelve `result[0]`**: `dataSource.query('CALL sp_x(?)', [id])` retorna `[resultRows[], fieldPackets]` — los datos están en `result[0]`. `const [rows] = await this.dataSource.query('CALL ...'); const status = rows[0]?.status`
- **`GROUP BY` sin todas las columnas no-agregadas**: toda columna en el `SELECT` que no sea función de agregación debe estar en el `GROUP BY`
- **Transacciones dentro del SP**: si el SP ya hace `START TRANSACTION`/`COMMIT`/`ROLLBACK`, llamarlo desde un `QueryRunner` con su propia transacción crea anidamiento no soportado. Un SP transaccional se llama con `dataSource.query()` directo
- **`HANDLER FOR SQLEXCEPTION` siempre con `ROLLBACK`**: `DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;` al inicio del bloque

### Orden de rutas en el controller — OBLIGATORIO

NestJS registra rutas en **orden de declaración**. Una ruta dinámica `/:id` definida antes que una ruta estática `/buscar/algo` captura el segmento `'buscar'` como el ID y nunca llega a la ruta correcta.

Regla fija para todo controller:

```
1. Rutas estáticas sin parámetros   (@Get('data-maestra'), @Get('buscar/x'), @Get('exportar/excel'), @Get())
2. Rutas de sub-recursos estáticos  (@Get('tipos'), @Post('tipos'), ...)
3. Rutas dinámicas con :id          (@Get(':id'), @Put(':id'), @Delete(':id'), @Get(':id/detalle'), ...)
```

### Permisos (RBAC)

- `@UseGuards(JwtAuthGuard, PermissionsGuard)` una vez en la **clase** del controller · `@RequirePermission('clave')` en cada **método** sin excepción
- Qué permiso usar según tipo de endpoint:
  - Búsquedas, combos, cálculos (solo-lectura) → `ver_x`
  - Listado principal → `ver_x`
  - Crear / Duplicar → `crear_x`
  - Editar / Cerrar / Actualizar estado → `editar_x`
  - Eliminar / Anular → `eliminar_x` o `anular_x`
  - Exportar Excel → `exportar_excel_x` · Exportar PDF → `exportar_pdf_x`
- Clave debe existir en la tabla de acciones **Y** estar asignada al rol — si falta alguna, el módulo no aparece en el sidebar

---

## 4. Bootstrap Global (`main.ts`)

- `process.env.TZ = '<tu_zona_horaria>'` — primera línea (ej: `'America/Lima'`), nunca mover
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- `TransformInterceptor` — envuelve TODO en `{ success, message, data, timestamp }`. Frontend siempre desenvuelve `.data`; para listas paginadas es `.data.data` / `.data.meta`
- `DatabaseExceptionFilter` — `ER_DUP_ENTRY` | `ER_ROW_IS_REFERENCED_2` → 409 · `ER_NO_REFERENCED_ROW_2` → 409 · resto → 500
- CORS antes de `helmet()` · dominio nuevo → agregarlo en `app.enableCors({ origin: [...] })`
- Logger: Winston (o la librería configurada), nunca `console.log`
- **Trim de query params** — registrar un middleware global que recorte espacios en todos los query params; evita que pegar texto con espacios rompa los buscadores `LIKE`. No agregarlo por módulo.
- **Validar variables de entorno al arrancar (fail fast)** — si `DB_HOST`, `JWT_SECRET` u otras vars críticas faltan en `.env`, el síntoma sin validación es un error confuso a mitad del primer request. Usar `ConfigModule.forRoot({ validationSchema: Joi.object({...}) })` para que el proceso muera con mensaje claro si falta una var esencial
- **Endpoint `/health` sin guard** — responde rápido sin tocar la BD: `{ status: 'ok' }`. Si se agrega check de BD, usar timeout corto
- **Correlation/Request ID en logs** — generar `const requestId = uuid()` por request y pasarlo al logger para poder filtrar logs de un request específico

---

## 5. Patrones Frontend

### ng-select — reglas obligatorias (OnPush + Signals)

1. **Sin `[appendTo]="'body'"` dentro de tablas** — el click en la opción no registra (click-outside lo intercepta primero)
2. **Sin `<div class="table-responsive">` cuando la tabla tiene `<ng-select>` dentro de celdas `<td>`** — `overflow-x:auto` recorta el panel del dropdown; reemplazar por `<div class="mb-3">` + `w-100` en la tabla
3. **Sin getter simple para filtros reactivos** — usar `computed()` + `toSignal(form.get('x')!.valueChanges.pipe(startWith(form.get('x')!.value)))` inicializado en el constructor
4. **`takeUntilDestroyed(this.destroyRef)`** en toda suscripción sin excepción
5. **Señales para estado reactivo** — `signal<T>()` + `.set()`. Las señales en OnPush disparan la detección automáticamente. `ChangeDetectorRef.markForCheck()` solo cuando una propiedad de clase (no signal) se actualiza dentro de `.subscribe()`
6. **`Number()` en ambos lados** al comparar IDs: `Number(a.id) === Number(idEmpresa)`
7. **`class="ng-select-sm"`** en todos los `<ng-select>` · `<select>` nativo: `class="form-select form-select-sm"`
8. **`[bindValue]` y `[bindLabel]` siempre explícitos** — sin ellos ng-select guarda el objeto completo (no el ID) y la comparación falla al editar
9. **`[clearable]="false"` en campos requeridos** — por defecto ng-select muestra botón ✕ que permite poner el campo en `null`
10. **`notFoundText="Sin resultados"`** en todo `<ng-select>` — el texto por defecto es en inglés
11. **`[virtualScroll]="true"` para listas grandes** — Si el dropdown tiene más de 200 ítems, agregar para renderizar solo los visibles
12. **`(open)` para carga lazy de opciones** — Si el catálogo es grande, cargarlo cuando el usuario abre el dropdown: `(open)="!tiposLoaded && cargarTipos()"`
13. **Textos y loading de ng-select en español** — Atributos obligatorios para ng-select con búsqueda async:
    ```html
    <ng-select
      placeholder="Escribe para buscar..."
      loadingText="Cargando..."
      notFoundText="Sin resultados"
      [loading]="buscando"
      [minTermLength]="2"
      typeToSearchText="Escribe al menos 2 caracteres">
    ```
14. **`[multiple]="true"` — el valor es un array** — `form.get('campo')!.value` retorna `number[]`. En el UPDATE, el backend debe hacer `DELETE + INSERT` de las relaciones
15. **Dropdowns en cascada** — escuchar el cambio del padre y recargar el hijo + limpiar su valor:
    ```ts
    this.formModal.get('id_padre')!.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(idPadre => {
            this.formModal.patchValue({ id_hijo: null });
            if (idPadre) this.cargarHijos(idPadre);
        });
    ```

### Errores backend ↔ frontend

- El backend manda el mensaje exacto y el `errorInterceptor` lo muestra automáticamente — en `.subscribe({ error })` solo limpiar estado local (`isSaving.set(false)`, etc.), **NUNCA** `alert.error('propio')`
- `AlertService` es el ÚNICO canal de feedback:
  `.success/error/warning/info(msg)` · `.showLoading/closeLoading()`
  - Confirmar antes de eliminar/anular — **nunca** `confirm()` nativo:
    ```ts
    if (!await this.alert.confirmDelete()) return;
    ```
  - `.confirmAction(titulo, mensaje)` para acciones que no son eliminar (anular, cerrar, etc.)
- **401 a mitad de sesión**: el interceptor HTTP debe capturar el 401 globalmente y redirigir a `/login` limpiando el estado de auth
- **Requests largos — timeout del `HttpClient`**: Angular no tiene timeout por defecto. Para exports/reportes pesados: `.pipe(timeout(60000), catchError(err => { if (err.name === 'TimeoutError') this.alert.error('La descarga tardó demasiado'); ... }))`

### Calidad de código — reglas frontend

| Regla | Detalle |
|-------|---------|
| **Sin `console.*`** | Prohibido en código que se suba — expone datos internos en DevTools de producción |
| **Sin URLs hardcodeadas** | Nunca `http://localhost:3001/...` — siempre `environment.apiUrl + '/ruta'` en el service |
| **Sin lógica en templates** | Cálculos, transformaciones y condiciones complejas van en el TS (`computed()`, métodos) |
| **Sin `setTimeout` para sincronizar** | Resolver con `ngAfterViewInit`, `effect()`, o reordenando el código |
| **Montos siempre como `number`** | `Number(valor)` antes de operar — los valores de la BD llegan como `string` en algunos drivers |
| **`markAllAsTouched()` antes de guardar** | `if (this.formModal.invalid) { this.formModal.markAllAsTouched(); return; }` |
| **`getRawValue()` en forms con campos disabled** | `form.value` excluye controles deshabilitados. Usar `form.getRawValue()` para enviar al backend |
| **`inject()` solo en contexto de clase** | Nunca dentro de métodos, callbacks ni `ngOnInit`. Solo en campo de clase o en el `constructor()` |
| **Signals en template necesitan `()`** | `{{ tableLoading() }}` / `@if (isSaving())`. Sin los `()`, Angular renderiza `[object Signal]` |
| **`form.reset()` borra valores por defecto** | `reset()` + `patchValue({ campo: valorDefault })` o definir el valor inicial en `fb.group` |
| **No usar `effect()` para cargar datos** | Para cargar datos reactivamente: `toSignal(observable)` o llamar el método explícitamente |
| **`ngOnInit` para carga inicial** | El constructor solo inyecta dependencias y configura el form |
| **`computed()` debe ser puro** | Nunca llamadas HTTP ni efectos secundarios dentro de `computed()` |
| **`patchValue` siempre, nunca `setValue`** | `patchValue` ignora campos extra; `setValue` exige exactamente los mismos controles o lanza error |
| **HttpParams: filtrar `null`/`undefined` antes de enviar** | `const p = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== null && v !== undefined && v !== ''))` |
| **`@for` requiere `track` por PK** | `@for (item of items(); track item.id_x)` — usar el PK real, nunca `$index` |
| **`loadComponent` en rutas, no `loadChildren`** | Las rutas usan `loadComponent: () => import('./x/x').then(m => m.XComponent)` |
| **`isSaving` en `next` Y en `error`** | Si solo lo pones en `next`, después de un error el botón queda bloqueado para siempre |
| **Navegación segura `?.` en templates** | `{{ item?.empresa?.nombre }}` o `@if (item)` como wrapper cuando la data llega async |
| **`responseType: 'blob'` para descargas** | `this.http.get(url, { responseType: 'blob' as 'json' })` para exports Excel/PDF |
| **`[innerHTML]` nunca con datos de usuario** | Usar interpolación `{{ texto }}` que Angular escapa completamente |
| **Signals y métodos del template no pueden ser `private`** | Todo signal, método y propiedad referenciado en la template debe ser sin modificador (public) |
| **`@for ... @empty` para lista vacía** | `@for (...) { ... } @empty { <app-empty-state/> }` — Angular evalúa `@empty` automáticamente |
| **`Validators.min(1)` para FK numéricos** | `Validators.required` acepta `0`. Para IDs de FK: `[Validators.required, Validators.min(1)]` |
| **Reactive forms siempre — `[(ngModel)]` prohibido** | Solo `ReactiveFormsModule` con `formControlName` |
| **`FormBuilder.nonNullable` para forms con defaults** | Al llamar `form.reset()`, los controles vuelven al valor INICIAL (no a `null`) |
| **`<ng-container>` para condicionales sin DOM extra** | Si necesitas condicionar múltiples elementos sin agregar nodo DOM en layouts flex/grid |
| **`debounceTime(300)` en filtros de búsqueda live** | `valueChanges.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cargarLista())` |
| **`ng-select` con búsqueda async — usar Subject** | `[typeahead]="buscar$"` donde `buscar$` es `Subject<string>` con `debounceTime` y `switchMap` |
| **`switchMap` vs `mergeMap`** | Para buscadores siempre `switchMap` — cancela el request anterior si llega uno nuevo |
| **`distinctUntilChanged()` junto a `debounceTime`** | `.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(...))` |
| **`$any()` para TypeScript en templates** | Escape hatch para cuando el template no hace type narrowing — usarlo solo como último recurso |
| **`FormArray` para listas dinámicas en forms** | `items = this.fb.array([])`. Agregar fila: `this.items.push(this.fb.group({monto: ['', Validators.required]}))` |
| **`AbstractControl.setErrors()` para errores del server** | `this.form.get('campo')!.setErrors({ serverError: err.error.message })` |
| **`ViewEncapsulation.None` prohibido** | Elimina el scope CSS de TODOS los componentes hijos. Estilos globales van en `styles.scss` |
| **`disable()`/`enable()` reactivo entre campos** | Los campos disabled se excluyen de `form.value` — usar `form.getRawValue()` para enviar al backend |
| **`!.` vs `?.`** | `!.` solo cuando estés 100% seguro de que el control existe. `?.` en acceso a objetos del backend |
| **`environment.ts` nunca con secretos** | Los valores se embeben en el bundle JS. Solo URLs públicas (`apiUrl`, etc.) |
| **`patchValue({ campo: undefined })` es ignorado** | Para limpiar un campo explícitamente usar `null`: `form.patchValue({ campo: null })` |
| **`signal.update(fn)` para valores derivados** | `count.update(c => c + 1)` — atómico y más legible que `count.set(count() + 1)` |
| **`toSignal()` como alternativa a subscribe+set** | `datos = toSignal(this.service.findAll().pipe(map(r => r.data)), { initialValue: [] })` |
| **Signals de array — actualización inmutable** | `this.lista.update(arr => [...arr, nuevoItem])`. Nunca `arr.push()` ni `arr.splice()` |
| **`forkJoin` para cargar datos iniciales en paralelo** | `forkJoin({ tipos: this.service.getTipos(), ... }).subscribe(({ tipos, ... }) => { ... })` |
| **`tap()` para efectos secundarios en pipe** | `tap(res => this.meta.set(res.data.meta))` — ejecuta sin modificar el valor |
| **`DestroyRef.onDestroy()` para limpieza inline** | `inject(DestroyRef).onDestroy(() => { this.modalRef?.dismiss(); subscription.unsubscribe(); })` |
| **`ng-select [disabled]` NO funciona con reactive forms** | Para deshabilitar correctamente: `this.form.get('campo')!.disable()` / `.enable()` |
| **`ActivatedRoute.queryParams` para estado en URL** | Para que filtros o tab activo sobrevivan F5: `route.queryParams.subscribe(p => ...)` |
| **`form.markAsPristine()` después de guardar** | Tras guardado exitoso: `this.formModal.markAsPristine(); this.formModal.markAsUntouched()` |
| **Reset de control individual** | `this.form.get('campo')!.reset()` o `setValue(null)` — para cascadas sin resetear todo el form |
| **`BigInt` no se serializa a JSON** | `res.insertId` puede ser `BigInt`. Siempre convertir: `id: Number(res.insertId)` |
| **`ng-select (change)` vs `valueChanges`** | `(change)` solo cuando el usuario selecciona; `valueChanges` también reacciona a `patchValue()`. Para cascadas al editar: usar `valueChanges` |
| **`@defer` para contenido pesado en modales** | `@defer (on interaction) { <app-grafico-pesado /> } @placeholder { <div class="spinner-border"></div> }` |
| **`Number.isNaN()` vs `isNaN()`** | Usar siempre `Number.isNaN()` que NO convierte el argumento antes de comprobar |
| **`[class.x]` vs `[ngClass]`** | Un condicional: `[class.active]="isActive()"`. Múltiples: `[ngClass]="{ 'text-danger': esAnulado() }"` |
| **Convención de nombres de métodos** | `cargar...()` para fetch · `guardar()` para submit · `eliminar(id)` / `anular(id)` · `abrir...Modal(item?)` · `aplicarFiltros()` / `limpiarFiltros()` |
| **`firstValueFrom()` para Observable a Promise** | `await firstValueFrom(this.service.findAll())`. `.toPromise()` está deprecated desde RxJS 7 |
| **`@Output()` + `EventEmitter` para hijo→padre** | `@Output() filtrar = new EventEmitter<any>()`. En Angular 17+: `output<T>()` de `@angular/core` |
| **`input()` signal function — Angular 17+** | `nombre = input.required<string>()` — alternativa moderna a `@Input()`. Se lee como signal: `nombre()` |
| **`untracked()` en effects** | Para leer un signal dentro de `effect()` sin crear dependencia: `untracked(() => this.otroSignal())` |
| **`asyncValidator` para unicidad de campo** | `validarUnico(ctrl): Observable<ValidationErrors \| null> { return timer(400).pipe(switchMap(() => this.service.verificar(ctrl.value)), map(existe => existe ? { duplicado: true } : null)) }` |
| **`CanDeactivate` para cambios sin guardar** | `canDeactivate(): boolean { return !this.formModal.dirty \|\| confirm('Tienes cambios sin guardar. ¿Salir?') }` |
| **`@HostListener` para eventos de teclado** | `@HostListener('document:keydown.escape') onEscape() { this.modalRef?.dismiss(); }` |
| **`Renderer2` para manipulación DOM** | Nunca `document.querySelector` directo. Usar `Renderer2`: `renderer.addClass(el, 'active')` |
| **`shareReplay(1)` para catálogos compartidos** | En el service: `tiposCache$ = this.http.get(...).pipe(shareReplay(1))` — el primer subscribe ejecuta el request; los siguientes reciben el mismo resultado cacheado |
| **`localStorage` — qué guardar** | Solo preferencias del usuario no sensibles: tema, estado sidebar, columnas visibles. **Nunca**: tokens JWT, datos de formulario, IDs de registros en edición. Prefijo obligatorio para no colisionar |
| **`combineLatest` vs `forkJoin` vs `zip`** | `forkJoin` — HTTP calls que terminan (espera todos). `combineLatest` — streams activos como `valueChanges` |
| **`BehaviorSubject` para estado compartido** | Componentes sin relación padre/hijo: `private estado$ = new BehaviorSubject<any>(null)` en el service |
| **`structuredClone` para copia profunda** | `const copia = structuredClone(item)` — disponible en Node 17+ y browsers modernos. No usar `JSON.parse(JSON.stringify())` que pierde `Date`, `undefined`, `BigInt` |
| **`retry` para fallas transitorias de red** | `pipe(retry({ count: 2, delay: 1000 }))` — solo en GET (idempotentes), nunca en POST/PUT/DELETE |
| **`@Pipe({ pure: false })` — trampa de performance** | Un pipe impuro se re-ejecuta en CADA ciclo de detección. Pipes siempre `pure: true`. Usar `computed()` si se necesita reactividad |
| **`@ViewChild` para referencias de template** | Disponible desde `ngAfterViewInit` — no acceder en `ngOnInit` |
| **`CanDeactivate` vs `[appFormDraft]`** | `CanDeactivate` para navegación fuera del módulo completo. `[appFormDraft]` para preservar el borrador en cambios dentro del mismo módulo |
| **`setInterval`/`setTimeout` — limpiar al destruir** | `const id = setInterval(...); this.destroyRef.onDestroy(() => clearInterval(id))`. Preferir `timer(0, 30000).pipe(takeUntilDestroyed(...))` de RxJS |
| **Tres estados obligatorios en toda vista con datos async** | `@if (tableLoading()) { <app-loader /> } @else if (lista().length === 0) { <app-empty-state /> } @else { <!-- tabla --> }` |

### CSS — solo clases del proyecto

- Antes de escribir cualquier clase: grep en `styles.scss` o copiar de un módulo hermano
- No usar clases Bootstrap sin tematizar (`btn-info`, `btn-success`, `bg-primary`, etc.) — salen con el tema por defecto que puede chocar con el tema del ERP
- **Reportes impresos desde el browser**: agregar reglas `@media print` que oculten sidebar, botones y filtros (`.no-print { display: none }`)
- **Accesibilidad mínima en botones de solo-ícono**: `aria-label="Editar"` en botones sin texto visible

### Componentes compartidos — usar siempre, nunca reinventar

> **⚠️ OBLIGATORIO**: Antes de escribir cualquier elemento UI, verificar si existe un componente compartido que lo cubra. **Está prohibido reimplementar** cualquiera de los componentes de esta tabla. Si falta un componente, crearlo en `shared/` — no duplicarlo en el módulo.

| Componente | Inputs principales | Cuándo usar / NUNCA reemplazar con |
|------------|--------------------|-------------------------------------|
| `<app-single-date-picker>` | `[formGroup]` `controlName` `label` `[readonly]` | Toda fecha individual en modal/form — **NUNCA** `<input type="date">` |
| `<app-datetime-picker>` | `[formGroup]` `controlName` `label` `[readonly]` | Fecha + hora — **NUNCA** `<input type="datetime-local">` |
| `<app-date-range-picker>` | `[formGroup]` `controlStart` `controlEnd` `label` | Rangos en filtros — **NUNCA** dos `<input type="date">` separados |
| `<app-table-pro>` | `[data]` `[meta]` `(pageChange)` `[loading]` `titulo` `[hideSearch]` `[showAddBtn]` `(add)` | Toda tabla de listado con paginación — **NUNCA** `<table>` custom con paginación propia |
| `<app-empty-state>` | `titleClass` + slot `description` | Estado "sin resultados" — **NUNCA** `<p>Sin resultados</p>` ni `<div>` manual |
| `<app-card-header>` | `icon` + slot default (título) + slot `[actions]` (botones) | Header de toda card — **NUNCA** `<div class="card-header">` manual |
| `<app-modal-header>` | `icon` + `(close)` | Header de todo modal — **NUNCA** `<div class="modal-header">` manual |
| `<app-form-error>` | `[control]="form.get('x')"` | Debajo de cada campo con validación — **NUNCA** `<div class="invalid-feedback">` manual |
| `<app-table-actions>` | `[showView]` `[showEdit]` `[showDelete]` + `(view)` `(edit)` `(delete)` | Botones de fila — **NUNCA** botones `<button>` de editar/eliminar manuales en cada `<td>` |
| `<app-status-badge>` | `variant` (`success`\|`danger`\|`warning`\|`primary`\|`secondary`\|`neutral`) | Badges de estado — **NUNCA** `<span class="badge">` ni `<span class="badge-erp ...">` manual |
| `[appFormDraft]="'entidad_draft'"` | — | En todo `<form>` de modal Crear/Editar — llamar `FormDraftDirective.clear('entidad_draft')` tras guardar exitoso |
| `<app-loader>` | `mensaje` `submensaje` `minHeight` | Spinner de pantalla/sección — **NUNCA** `<div class="spinner-border">` manual en bloque; no usar para loading inline de `app-table-pro` |
| `<app-erp-tabs>` | `[tabs]="tabs"` `[activeTab]="tabActivo()"` `(tabChange)="tabActivo.set($event)"` | Navegación entre secciones — **NUNCA** tabs con `[ngClass]` o clases Bootstrap crudas |

### Convenciones de listados — replicar siempre

- **Patrón completo `guardar()`** — secuencia fija en todo modal de CRUD:
  ```ts
  async guardar() {
      if (this.formModal.invalid) { this.formModal.markAllAsTouched(); return; }
      this.isSaving.set(true);
      const data = this.formModal.getRawValue();
      const obs = this.editingId()
          ? this.service.update(this.editingId()!, data)
          : this.service.create(data);
      obs.subscribe({
          next: () => {
              this.isSaving.set(false);
              this.alert.success(this.editingId() ? 'Actualizado correctamente' : 'Creado correctamente');
              this.modalRef.close();
              FormDraftDirective.clear('entidad_draft');
              this.cargarLista();
          },
          error: () => this.isSaving.set(false)
      });
  }
  ```
  Orden obligatorio: validar → `isSaving.set(true)` → llamar service → en `next`: limpiar + toast + cerrar modal + recargar lista.

- **Signals estándar** — todos `signal<boolean>(false)` salvo `editingId`:
  ```ts
  tableLoading = signal<boolean>(false);
  isSaving     = signal<boolean>(false);
  descargando  = signal<boolean>(false);
  editingId    = signal<number | null>(null);
  ```

- **Modal** — patrón completo `abrirModal`:
  ```ts
  private modal = inject(NgbModal);
  modalRef: any = null;

  abrirModal(content: any, item: any = null) {
      this.editingId.set(item?.id_x ?? null);
      if (item) {
          this.formModal.patchValue(item);
      } else {
          this.formModal.reset();
      }
      this.modalRef = this.modal.open(content, { size: 'lg', centered: true, scrollable: true, backdrop: 'static' });
  }
  ```
  - `backdrop: 'static'` evita cerrar el modal haciendo clic fuera
  - Cerrar desde el header: `(close)="modalRef.dismiss()"` en `<app-modal-header>`

- **Métodos del service Angular**: `findAll` / `create` / `update` / `delete` / `exportarExcel` / `exportarPdf` — no usar sinónimos
- **Rutas**: `loadComponent` lazy · sin guards de permiso en rutas (control en template con `perms.hasPermission(...)`) — inyección: `perms = inject(PermissionsService)`
- **Fechas**: `| date:'dd/MM/yyyy'` (con hora: `'dd/MM/yyyy hh:mm a'`) · **Montos**: `S/ {{ val | number:'1.2-2' }}` — el pipe `number` agrega separador de miles; no usar `toFixed()` ni concatenar el símbolo dentro del valor que se ordena
- **IDs** ⚠️ OBLIGATORIO: TODA tabla de listado debe tener como primera columna el ID del registro + fecha debajo. Patrón exacto:
  ```html
  <div class="fw-bold text-primary-erp font-numeric-erp">#{{ item.id_x }}</div>
  <div class="text-muted-erp text-xs-erp font-numeric-erp fw-bold mt-1">{{ item.fecha | date:'dd/MM/yyyy' }}</div>
  ```
  Reglas: `#` antes del número · sin `| number` pipe · sin badge
- **Tabs en módulos multi-sección**: usar `<app-erp-tabs>` · `tabActivo` debe ser `signal<string>`
- **RUC/DNI**: `Validators.pattern(/^\d{11}$/)` RUC · `/^\d{8}$/` DNI
- **Selección múltiple + acción masiva**: checkbox por fila + "seleccionar todos", guardar IDs en `signal<number[]>([])`, enviar array al backend (`POST /anular-masivo { ids: number[] }`) en una sola transacción — nunca N requests HTTP separados
- **Validación de archivo en frontend espejo del backend** — `accept=".pdf,.jpg,.png"` + chequeo de `file.size` en TS. Es UX, no seguridad (el backend siempre revalida)
- **Doble submit — deshabilitar el botón mientras `isSaving`** — `[disabled]="isSaving() || tableLoading()"`

---

## 6. Checklist — Módulo CRUD Nuevo

**Base de datos — primero**
- [ ] Crear o verificar el módulo en la tabla de módulos del sistema (`sis_modulo` o equivalente)
- [ ] Insertar los permisos que apliquen: `ver_x` / `crear_x` / `editar_x` / `eliminar_x` / `exportar_excel_x` / `exportar_pdf_x`; algunos módulos usan `anular_x` en lugar de `eliminar_x`
- [ ] Asignar los permisos a los roles que correspondan

**Backend**
- [ ] Crear carpeta `modules/<area>/<feature>/` con `.dto.ts` + `.service.ts` + `.controller.ts` + `.module.ts` · **registrar `XModule` en el módulo raíz de la API** — sin esto → 404
- [ ] `@UseGuards(JwtAuthGuard, PermissionsGuard)` en la clase + `@RequirePermission('clave')` en cada método
- [ ] Orden de rutas en el controller: estáticas primero → sub-recursos estáticos → dinámicas con `:id` al final
- [ ] `findAll` paginado con patrón `isExport`:
  ```ts
  async findAll(query: any, isExport = false) {
      const page  = isExport ? 1 : (Number(query.page) || 1);
      const limit = isExport ? 5000 : (Number(query.limit) || 10);
      const offset = (page - 1) * limit;
      if (isExport) return this.dataSource.query(sql, [...params, limit, offset]);
      const [data, totalRes] = await Promise.all([
          this.dataSource.query(sql, [...params, limit, offset]),
          this.dataSource.query(`SELECT COUNT(*) as total FROM ... ${where}`, params)
      ]);
      return { data, meta: { total: Number(totalRes[0]?.total || 0), page, limit } };
  }
  ```
- [ ] Filtros con placeholders `?` · todo `SELECT` incluye `AND estado = 1` · `ORDER BY` dinámico usa whitelist · INSERTs con columnas explícitas · params numéricos validados con `Number()` + guard `isNaN`
- [ ] Totales/montos recalculados en backend — no confiar en lo que envía el cliente
- [ ] Exportación con `ExcelService` + `PdfService` (o `ExcelJS` directo si el reporte necesita múltiples hojas)
- [ ] `auditoriaService.registrar(...)` tras cada operación crítica (crear, editar, eliminar, anular)
- [ ] Endpoints `buscar/x` con LIMIT: incluir prioridad de ID exacto con `CASE WHEN id = ? THEN 0 ELSE 1 END`
- [ ] Columnas `ENUM` validadas en el DTO con `@IsIn([...])` · columnas de dinero como `DECIMAL`, nunca `FLOAT`/`DOUBLE`
- [ ] Si la entidad tiene scope (empresa/cliente/etc): `findOne`/`update`/`delete` filtran por esa columna además del ID (ver regla IDOR)

**Frontend**
- [ ] Componente con `changeDetection: ChangeDetectionStrategy.OnPush` y `destroyRef = inject(DestroyRef)` · array `imports: []` completo
- [ ] Service con `apiUrl = environment.apiUrl + '/...'` y métodos `findAll/create/update/delete/exportarExcel/exportarPdf`
- [ ] Entrada en `sidebar.ts` + ruta lazy en `<modulo>.routes.ts`
- [ ] `formFiltros` separado del `formModal` — **nunca en el mismo FormGroup**
- [ ] `<app-table-pro>` con `[data]`, `[meta]`, `(pageChange)`, `[loading]` conectados + `aplicarFiltros()` + `limpiarFiltros()` + `cambiarPagina(n)`
- [ ] `<app-date-range-picker>` en filtros · `<app-single-date-picker>` en modales · **NUNCA** `<input type="date">` directo
- [ ] `[appFormDraft]="'entidad_draft'"` en modal + `FormDraftDirective.clear('entidad_draft')` tras guardar
- [ ] `@if (perms.hasPermission('...'))` en CADA botón de acción
- [ ] `AlertService.confirmDelete()` antes de toda eliminación · `confirmAction()` antes de toda anulación
- [ ] `formModal.markAllAsTouched()` al inicio del método `guardar()`
- [ ] Texto body en POST/PUT trimmeado manualmente
- [ ] **`<app-card-header>`** en toda card · **`<app-modal-header>`** en todo modal · **`<app-table-actions>`** en cada fila
- [ ] **Primera columna ID/FECHA** — TODA tabla sin excepción con el patrón exacto de la sección 5
- [ ] **`<app-status-badge [variant]="...">`** para TODO badge de estado — NUNCA `<span class="badge-erp ...">` manual
- [ ] **`ng-select-sm`** en TODOS los `<ng-select>` · `form-select form-select-sm` en todo `<select>` nativo
- [ ] `takeUntilDestroyed(this.destroyRef)` en TODA suscripción
- [ ] En `.subscribe({ error })` solo limpiar estado local — NUNCA `alert.error('mensaje propio')`
- [ ] `[disabled]="isSaving()"` en el botón de Guardar/Eliminar/Exportar
- [ ] Tres estados manejados: loading (`<app-loader>`), vacío (`<app-empty-state>`), con datos
- [ ] `@for` con `track item.id_x` (PK real) — nunca `track $index`
- [ ] `aria-label` en todo botón de solo-ícono

---

## 7. Checklist — Renombrar Módulo

1. Renombrar carpeta + archivos · actualizar clases internas, imports, `@Controller('...')`, `apiUrl`
2. Strings de `@RequirePermission(...)` en backend Y frontend
3. Rutas en `<modulo>.routes.ts` + `sidebar.ts` (label, route, permiso)
4. Grep del nombre viejo (comentarios cruzados)
5. `UPDATE sis_accion SET clave=...` en local **Y** en nube antes del deploy — si no, usuarios pierden el permiso
6. NUNCA renombrar tablas/columnas de BD por un cambio de nombre del módulo
