import { ClassSerializerInterceptor, Logger, LogLevel } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as bodyParser from "body-parser";
import * as cookieParser from "cookie-parser";
import { NextFunction, Request, Response } from "express";
import * as fs from "fs";
import { I18nValidationExceptionFilter, I18nValidationPipe } from "nestjs-i18n";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";
import {
  DATA_DIRECTORY,
  LOG_LEVEL_AVAILABLE,
  LOG_LEVEL_DEFAULT,
  LOG_LEVEL_ENV,
} from "./constants";
import { DepositService } from "./stundtransfer/deposit.service"; // StundTransfer
import { STUND_CHUNK_BYTES } from "./stundtransfer/stundtransfer.config"; // StundTransfer

function generateNestJsLogLevels(): LogLevel[] {
  if (LOG_LEVEL_ENV) {
    const levelIndex = LOG_LEVEL_AVAILABLE.indexOf(LOG_LEVEL_ENV as any);
    if (levelIndex === -1) {
      throw new Error(`log level ${LOG_LEVEL_ENV} unknown`);
    }

    return LOG_LEVEL_AVAILABLE.slice(levelIndex, LOG_LEVEL_AVAILABLE.length);
  } else {
    const levelIndex = LOG_LEVEL_AVAILABLE.indexOf(LOG_LEVEL_DEFAULT);
    return LOG_LEVEL_AVAILABLE.slice(levelIndex, LOG_LEVEL_AVAILABLE.length);
  }
}

// StundTransfer: with "true", Express trusted every X-Forwarded-For entry, so
// anyone could pick their own IP and escape the rate limits. Only the proxies
// of the container (Caddy on loopback) and of the local network (DSM's
// reverse proxy) are trusted now: req.ip is the first public address from the
// right. A hop count ("2") or an address list ("loopback, 10.0.0.0/8") is
// passed to Express as is.
function trustProxy(value: string | undefined): boolean | number | string {
  const v = value?.trim() ?? "";
  if (!v || v.toLowerCase() === "false") return false;
  if (v.toLowerCase() === "true") return "loopback, uniquelocal";
  return /^\d+$/.test(v) ? parseInt(v, 10) : v;
}

async function bootstrap() {
  const logLevels = generateNestJsLogLevels();
  Logger.log(`Showing ${logLevels.join(", ")} messages`);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels,
  });

  app.useGlobalPipes(new I18nValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new I18nValidationExceptionFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const config = app.get<ConfigService>(ConfigService);

  // StundTransfer: the limit never goes below a chunk size already given to
  // browsers, so lowering the setting does not break uploads in progress,
  // even after a restart
  let largestChunkSize = Math.max(
    STUND_CHUNK_BYTES,
    await app
      .get(DepositService)
      .largestChunkSizeInUse()
      .catch(() => 0),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    const chunkSize = config.get("share.chunkSize");
    largestChunkSize = Math.max(largestChunkSize, chunkSize); // StundTransfer
    bodyParser.raw({
      type: "application/octet-stream",
      limit: `${largestChunkSize}B`, // StundTransfer: was chunkSize
    })(req, res, next);
  });

  app.use(cookieParser());
  // StundTransfer: set on the Express instance itself; through Nest's wrapper
  // an invalid value exits the process before reaching the catch
  const expressApp = app.getHttpAdapter().getInstance();
  try {
    expressApp.set("trust proxy", trustProxy(process.env.TRUST_PROXY));
  } catch {
    // StundTransfer: a value Express does not understand is ignored, as before
    Logger.warn(
      `TRUST_PROXY="${process.env.TRUST_PROXY}" not understood, ignored`,
    );
    expressApp.set("trust proxy", false);
  }

  await fs.promises.mkdir(`${DATA_DIRECTORY}/uploads/_temp`, {
    recursive: true,
  });

  app.setGlobalPrefix("api");

  // Setup Swagger in development mode
  if (process.env.NODE_ENV == "development") {
    const config = new DocumentBuilder()
      .setTitle("Pingvin Share API")
      .setVersion("1.0")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/swagger", app, document);
  }

  // StundTransfer: on a slow connection a chunk can take more than Node's
  // default 300 s (408, sent again forever). headersTimeout (60 s) still
  // protects against clients that never finish sending their headers.
  app.getHttpServer().requestTimeout = 2 * 60 * 60 * 1000;

  await app.listen(
    parseInt(process.env.BACKEND_PORT || process.env.PORT || "8080"),
  );

  const logger = new Logger("UnhandledAsyncError");
  process.on("unhandledRejection", (e) => logger.error(e));
}
bootstrap();
