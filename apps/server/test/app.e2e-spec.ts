import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/health')
      .expect(200);
    const body: unknown = response.body;

    expect(body).toMatchObject({
      status: 'ok',
      service: 'yeen-api',
    });
    expect(isRecord(body)).toBe(true);
    const timestamp = isRecord(body) ? body.timestamp : undefined;
    expect(typeof timestamp).toBe('string');
    expect(
      typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp)),
    ).toBe(true);
  });

  afterAll(async () => {
    await app.close();
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
