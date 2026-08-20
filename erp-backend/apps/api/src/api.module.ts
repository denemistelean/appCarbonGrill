import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from '@app/database';
import { SecurityModule } from '@app/security';
import { AuditoriaModule } from '@app/common';
import { AuthModule as SharedAuthModule } from '@app/auth';

import { ApiController } from './api.controller';
import { ApiService } from './api.service';

// --- Módulos Core (base sólida y reutilizable) ---
import { SeguridadModule } from './core/seguridad/seguridad.module';
import { UsuariosModule } from './core/usuarios/usuarios.module';
import { MailModule } from './core/mail/mail.module';
import { AuthModule as LocalAuthModule } from './core/auth/auth.module';

// --- Dominio (agregar módulos de Carbon Grill aquí) ---
import { DashboardModule } from './erp/dashboard/dashboard.module';
import { SucursalesModule } from './erp/organizacion/sucursales/sucursales.module';
import { AsignacionesModule } from './erp/organizacion/asignaciones/asignaciones.module';
import { MaestrosModule } from './erp/catalogo/maestros/maestros.module';
import { InsumosModule } from './erp/catalogo/insumos/insumos.module';
import { ProductosModule } from './erp/catalogo/productos/productos.module';
import { InventarioModule } from './erp/inventario/inventario.module';
import { MesasModule } from './erp/mesas/mesas.module';
import { PedidosModule } from './erp/pedidos/pedidos.module';
import { CajaModule } from './erp/caja/caja.module';
import { ComprobantesModule } from './erp/comprobantes/comprobantes.module';
import { CartaModule } from './erp/carta/carta.module';
import { ReportesModule } from './erp/reportes/reportes.module';
import { CartaVitrinaModule } from './erp/carta-vitrina/carta-vitrina.module';
import { ClientesModule } from './erp/clientes/clientes.module';
import { PosModule } from './erp/pos/pos.module';
import { TrasladosModule } from './erp/traslados/traslados.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    DatabaseModule,
    SharedAuthModule,
    SecurityModule,
    AuditoriaModule,
    LocalAuthModule,
    UsuariosModule,
    SeguridadModule,
    MailModule,
    DashboardModule,
    SucursalesModule,
    AsignacionesModule,
    MaestrosModule,
    InsumosModule,
    ProductosModule,
    InventarioModule,
    MesasModule,
    PedidosModule,
    CajaModule,
    ComprobantesModule,
    CartaModule,
    ReportesModule,
    CartaVitrinaModule,
    ClientesModule,
    PosModule,
    TrasladosModule,
  ],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
