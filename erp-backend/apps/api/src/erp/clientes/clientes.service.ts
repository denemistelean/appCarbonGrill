import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';
import { IDENTITY_SERVICE } from '../../common/integrations/identity/identity.tokens';
import type { IIdentityService } from '../../common/integrations/identity/identity.interface';
import { CreateClienteDto, UpdateClienteDto } from './clientes.dto';

@Injectable()
export class ClientesService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    @Inject(IDENTITY_SERVICE) private readonly identity: IIdentityService,
  ) {}

  consultarIdentity(tipo: string, numero: string) {
    return this.identity.consultarDocumento(tipo, numero);
  }

  async findAll(query: any) {
    if (Array.isArray(query?.page) || Array.isArray(query?.limit) || Array.isArray(query?.search)) {
      throw new BadRequestException('Param inválido');
    }
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE estado_registro = 'ACTIVO'`;
    if (query.search) {
      const s = `%${String(query.search).trim()}%`;
      where += ` AND (razon_social LIKE ? OR numero_documento LIKE ? OR nombres LIKE ?)`;
      params.push(s, s, s);
    }
    if (query.tipo_documento) {
      where += ` AND tipo_documento = ?`;
      params.push(String(query.tipo_documento).toUpperCase());
    }
    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT id_cliente, tipo_documento, numero_documento, razon_social, nombres, direccion, telefono, correo
         FROM cliente ${where} ORDER BY id_cliente DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total FROM cliente ${where}`, params),
    ]);
    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async lista(search?: string) {
    const params: any[] = [];
    let where = `WHERE estado_registro = 'ACTIVO'`;
    if (search) {
      const s = `%${String(search).trim()}%`;
      where += ` AND (razon_social LIKE ? OR numero_documento LIKE ?)`;
      params.push(s, s);
    }
    return this.dataSource.query(
      `SELECT id_cliente, tipo_documento, numero_documento, razon_social, direccion,
              CONCAT(razon_social, ' · ', tipo_documento, ' ', numero_documento) AS etiqueta
       FROM cliente ${where}
       ORDER BY razon_social ASC
       LIMIT 50`,
      params,
    );
  }

  async findOne(id: number) {
    this.assertId(id);
    const [row] = await this.dataSource.query(
      `SELECT id_cliente, tipo_documento, numero_documento, razon_social, nombres, direccion, telefono, correo
       FROM cliente WHERE id_cliente = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Cliente no encontrado');
    return row;
  }

  async create(dto: CreateClienteDto, userId: number) {
    const payload = this.normalize(dto);
    try {
      const result = await this.dataSource.query(
        `INSERT INTO cliente (tipo_documento, numero_documento, razon_social, nombres, direccion, telefono, correo, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [payload.tipo_documento, payload.numero_documento, payload.razon_social, payload.nombres, payload.direccion, payload.telefono, payload.correo, userId],
      );
      const created = await this.findOne(Number(result.insertId));
      await this.auditoriaService.registrar('cliente', created.id_cliente, 'CREAR', userId, null, created);
      return created;
    } catch (e: any) {
      if (String(e?.message || '').includes('uk_cliente_doc')) {
        throw new ConflictException('Ya existe un cliente con ese documento');
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdateClienteDto, userId: number) {
    const old = await this.findOne(id);
    const payload = this.normalize({ ...old, ...dto });
    await this.dataSource.query(
      `UPDATE cliente
       SET tipo_documento = ?, numero_documento = ?, razon_social = ?, nombres = ?, direccion = ?, telefono = ?, correo = ?, id_usuario_mod = ?
       WHERE id_cliente = ? AND estado_registro = 'ACTIVO'`,
      [payload.tipo_documento, payload.numero_documento, payload.razon_social, payload.nombres, payload.direccion, payload.telefono, payload.correo, userId, id],
    );
    const updated = await this.findOne(id);
    await this.auditoriaService.registrar('cliente', id, 'ACTUALIZAR', userId, old, updated);
    return updated;
  }

  async remove(id: number, userId: number) {
    const old = await this.findOne(id);
    if (old.numero_documento === '00000000') throw new ConflictException('No se puede eliminar CLIENTES VARIOS');
    await this.dataSource.query(
      `UPDATE cliente SET estado_registro = 'ELIMINADO', id_usuario_mod = ? WHERE id_cliente = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    await this.auditoriaService.registrar('cliente', id, 'ELIMINAR', userId, old, null);
    return { id_cliente: id };
  }

  private normalize(dto: CreateClienteDto | UpdateClienteDto) {
    return {
      tipo_documento: String(dto.tipo_documento || 'DNI').toUpperCase(),
      numero_documento: String(dto.numero_documento || '').replace(/\s/g, ''),
      razon_social: String(dto.razon_social || '').trim().toUpperCase(),
      nombres: dto.nombres?.trim() || null,
      direccion: dto.direccion?.trim() || null,
      telefono: dto.telefono?.trim() || null,
      correo: dto.correo?.trim() || null,
    };
  }

  private toPositiveNumber(value: any, fallback: number) {
    const n = Number(value);
    return n > 0 && !Number.isNaN(n) ? n : fallback;
  }

  private assertId(id: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('ID inválido');
  }
}
