import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyBaseLogger, type FastifyError } from "fastify";
import {
  type ZodTypeProvider,
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { registerAuth } from "./auth.js";
import type { AppDeps } from "./deps.js";
import { HttpError, isUniqueViolation } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { clubRoutes } from "./routes/clubs.js";
import { matchRoutes } from "./routes/matches.js";
import { userRoutes } from "./routes/users.js";

function problem(status: number, slug: string, title: string, extra: Record<string, unknown> = {}) {
  return { type: `/problems/${slug}`, title, status, ...extra };
}

export async function buildApp(deps: AppDeps, options: { logger?: FastifyBaseLogger } = {}) {
  const app = Fastify({
    ...(options.logger ? { loggerInstance: options.logger } : { logger: false }),
    // nginx on the same machine sets X-Forwarded-For; trust nobody else's.
    trustProxy: "127.0.0.1",
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    reply.type("application/problem+json");
    if (hasZodFastifySchemaValidationErrors(error)) {
      const errors = error.validation.map((v) => ({ path: v.instancePath, message: v.message }));
      return reply.code(400).send(problem(400, "validation", "The request is not valid.", { errors }));
    }
    if (error instanceof HttpError) {
      return reply.code(error.status).send(problem(error.status, error.slug, error.message, error.extra));
    }
    if (isUniqueViolation(error)) {
      return reply.code(409).send(problem(409, "conflict", "That conflicts with something that already exists."));
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send(problem(error.statusCode, "bad_request", error.message));
    }
    request.log.error({ err: error }, "Unhandled error");
    return reply.code(500).send(problem(500, "internal", "Something went wrong."));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).type("application/problem+json").send(problem(404, "not_found", `No route for ${request.method} ${request.url}.`)),
  );

  await app.register(swagger, {
    openapi: {
      info: { title: "Field Hockey Match API", version: "1.0.0" },
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
      security: [{ bearer: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/v1/docs" });

  registerAuth(app, deps);

  await app.register(
    async (v1) => {
      v1.get("/health", { schema: { hide: true } }, async () => ({ ok: true }));
      await v1.register(authRoutes(deps));
      await v1.register(userRoutes(deps));
      await v1.register(clubRoutes(deps));
      await v1.register(matchRoutes(deps));
    },
    { prefix: "/v1" },
  );

  return app;
}
