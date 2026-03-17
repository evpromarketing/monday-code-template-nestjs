import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  logBody(body: unknown): { received: true } {
    this.logger.log(JSON.stringify(body, null, 2));
    return { received: true };
  }
}
