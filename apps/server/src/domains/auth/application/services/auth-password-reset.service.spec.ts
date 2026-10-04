import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthPasswordResetService } from './auth-password-reset.service';
import { AuthService } from './auth.service';
import { AuthController } from '../../presentation/controllers/auth.controller';

describe('public password recovery', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthPasswordResetService,
        { provide: AuthService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('returns the same recovery guidance without issuing any credential', async () => {
    const known = await request(app.getHttpServer() as Server)
      .post('/auth/password-reset/request')
      .send({ email: 'admin@example.com' })
      .expect(201);
    const unknown = await request(app.getHttpServer() as Server)
      .post('/auth/password-reset/request')
      .send({ email: 'missing@example.com' })
      .expect(201);
    expect(known.body).toEqual(unknown.body);
    const body: unknown = known.body;
    expect(body).toEqual({
      message: 'Contact your Yeen administrator to reset your password.',
      resetPath: null,
      expiresAt: null,
    });
  });
  it('refuses old public reset links', async () => {
    await request(app.getHttpServer() as Server)
      .post('/auth/password-reset/confirm')
      .send({ token: 'old-token', newPassword: 'cannot-change-password' })
      .expect(400);
  });
});
