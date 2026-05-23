import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/domains/core/presentation/controllers/app.controller';
import { AppService } from '../src/domains/core/application/services/app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return a healthy payload', () => {
      const result = appController.getHealth();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('yeen-api');
    });
  });
});
