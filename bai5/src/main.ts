import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { BuggyAppModule } from './buggy/buggy-app.module';

// APP_VARIANT=buggy: chay cau hinh GOC (co loi) de tai hien loi bang tay. Mac dinh chay ban da sua.
const isBuggy = process.env.APP_VARIANT === 'buggy';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(isBuggy ? BuggyAppModule : AppModule);
  // Neu chay sau reverse proxy / load balancer, bat dong duoi de req.ip la IP that cua client
  // (so hop bang so proxy tin cay, KHONG dung `true` vi client co the gia mao X-Forwarded-For).
  // app.set('trust proxy', 1);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`ShopFast (bai 5, ${isBuggy ? 'BAN GOC - CO LOI' : 'ban da sua'}) listening on http://localhost:${port}`);
}
bootstrap();
