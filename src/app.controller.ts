import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): { status: string } {
    return this.appService.getHealth();
  }

  @Post()
  create(@Body() body: unknown): { received: true } {
    return this.appService.logBody(body);
  }
}
