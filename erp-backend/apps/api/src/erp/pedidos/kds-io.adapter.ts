import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/** CORS del HTTP también aplica al canal Socket.IO (namespace /kds). */
export class KdsIoAdapter extends IoAdapter {
  constructor(
    app: any,
    private readonly origins: string[] | boolean,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.origins,
        credentials: true,
      },
    });
  }
}
