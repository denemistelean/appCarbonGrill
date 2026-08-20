# Identity SUNAT — Carbon Grill

Microservicio Express + Playwright que consulta DNI/RUC en el portal SUNAT.
El ERP **no** habla con SUNAT directo: Angular → `/api/clientes/identity` → Nest → este servicio.

Puerto **3791** (el API Carbon Grill usa 3790; Repuestos usa 3781).

```bash
cd identity-sunat-service
npm i
npm start
```

Salud: http://127.0.0.1:3791/health

```
GET  /consultar?tipo=DNI|RUC&numero=
POST /consultar   { "tipo": "DNI"|"RUC", "numero": "..." }
```

En `erp-backend/.env`:

```
IDENTITY_PROVIDER=http
IDENTITY_HTTP_URL=http://127.0.0.1:3791
IDENTITY_TIMEOUT_MS=50000
```

Sin el micro, deje `IDENTITY_PROVIDER=mock`.
