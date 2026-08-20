export const environment = {
  production: false,
  // Mismo origen que ng serve (4203); el proxy reenvía /api a Nest 3790.
  apiUrlGestion: '/api',
  uploadsUrl: '/uploads/',
  wsUrl: 'http://localhost:3790/kds',
};
