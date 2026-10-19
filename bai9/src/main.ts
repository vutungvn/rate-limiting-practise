import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const logger = new Logger('Process');
// Luoi an toan cuoi cung: ghi lai, khong de tien trinh chet vi mot loi bi bo sot.
process.on('unhandledRejection', (reason) => logger.error(`unhandledRejection: ${(reason as Error)?.stack ?? reason}`));
process.on('uncaughtException', (err) => logger.error(`uncaughtException: ${err.stack ?? err}`));

export async function bootstrap(port = Number(process.env.PORT ?? 3000)) {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.enableShutdownHooks();
  await app.listen(port);
  return app;
}

if (require.main === module) {
  bootstrap().then((app) => logger.log(`Bai 9 - Flash sale shield listening on ${app.getHttpServer().address().port}`));
}
