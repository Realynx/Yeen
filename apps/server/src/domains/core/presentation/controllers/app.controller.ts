import { Controller, Get } from '@nestjs/common';
import { AppService } from '../../application/services/app.service';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth() {
    return this.appService.getHealth();
  }
}
