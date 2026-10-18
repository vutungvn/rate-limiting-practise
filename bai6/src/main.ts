import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const algorithm = process.env.LIMITER === 'fixed' ? 'FixedWindowLimiter (CU - CO LOI)' : 'SlidingWindowLimiter';
  const clock = process.env.ALLOW_FAKE_CLOCK === 'true' ? 'GIA LAP qua header x-fake-now' : 'that';
  console.log(`Bai 6 listening on http://localhost:${port} | thuat toan: ${algorithm} | dong ho: ${clock}`);
}
bootstrap();
