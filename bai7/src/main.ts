import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const clock = process.env.ALLOW_FAKE_CLOCK === 'true' ? 'GIA LAP qua header x-fake-now' : 'that';
  console.log(`Bai 7 listening on http://localhost:${port} | dong ho: ${clock}`);
}
bootstrap();
