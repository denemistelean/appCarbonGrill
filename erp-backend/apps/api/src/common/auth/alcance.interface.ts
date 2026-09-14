export interface AlcanceSucursal {
  esSuperadmin: boolean;
  idSucursal: number | null;
  rol: string;
}

export const ROLES_OPERATIVOS = ['ADMIN_SUCURSAL', 'MOZO', 'CAJA', 'COCINA', 'BAR'] as const;
