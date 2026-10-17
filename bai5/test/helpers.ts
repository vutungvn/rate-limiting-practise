import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

/**
 * Khoi tao app that (listen cong ngau nhien) de supertest gui duoc nhieu request song song.
 * `configure` dung de bat cac tuy chon Express, vi du `trust proxy` khi gia lap bot doi IP.
 */
export async function createApp(
  metadata: Parameters<typeof Test.createTestingModule>[0],
  configure?: (app: NestExpressApplication) => void,
) {
  const moduleRef = await Test.createTestingModule(metadata).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configure?.(app);
  await app.listen(0);
  return app;
}

export const trustProxy = (app: NestExpressApplication) => app.set('trust proxy', true);

/** Dong ho gia: dieu khien Date.now() de "tua" 60 giay / 5 phut ma khong phai cho that. */
export function useFakeClock() {
  let now = Date.now();
  const spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  return {
    advance: (ms: number) => {
      now += ms;
    },
    restore: () => spy.mockRestore(),
  };
}

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;

export function placeFlashSaleOrder(app: INestApplication, userId: string | null = 'user-1', ip?: string) {
  const req = request(app.getHttpServer()).post('/orders/flash-sale');
  if (userId) req.set('x-user-id', userId);
  if (ip) req.set('x-forwarded-for', ip);
  return req.send({ productId: 'iphone-17', quantity: 1 });
}

export function sendOtp(app: INestApplication, phone: string | null = '0912345678', ip?: string) {
  const req = request(app.getHttpServer()).post('/auth/send-otp');
  if (ip) req.set('x-forwarded-for', ip);
  return req.send(phone === null ? {} : { phone });
}

/** Goi lien tiep (tuan tu) n lan va tra ve danh sach status code. */
export async function statuses(n: number, call: (i: number) => request.Test): Promise<number[]> {
  const result: number[] = [];
  for (let i = 0; i < n; i++) result.push((await call(i)).status);
  return result;
}

/** Ban n request cung luc (song song) va tra ve danh sach status code. */
export async function concurrentStatuses(n: number, call: (i: number) => request.Test): Promise<number[]> {
  const responses = await Promise.all(Array.from({ length: n }, (_, i) => call(i)));
  return responses.map((r) => r.status);
}

export const count = (list: number[], status: number) => list.filter((s) => s === status).length;

/** IP gia lap thu i, dung voi header X-Forwarded-For. */
export const fakeIp = (i: number) => `10.0.${Math.floor(i / 250)}.${(i % 250) + 1}`;
