import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';

type ValidationContext = 'body' | 'querystring' | 'params' | 'headers';

const VALIDATION_ERRORS: Record<ValidationContext, { code: string; message: string }> = {
  body: { code: 'INVALID_REQUEST_BODY', message: 'Request body is invalid' },
  querystring: { code: 'INVALID_QUERY_PARAMETERS', message: 'Query parameters are invalid' },
  params: { code: 'INVALID_PATH_PARAMETERS', message: 'Path parameters are invalid' },
  headers: { code: 'INVALID_HEADERS', message: 'Request headers are invalid' },
};

const FRAMEWORK_ERRORS: Record<number, string> = {
  400: 'INVALID_REQUEST_BODY',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return reply.code(statusCode).send({
    error: { code, message, ...(details === undefined ? {} : { details }) },
    request_id: request.id,
  });
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return sendError(request, reply, error.statusCode, error.code, error.message, error.details);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const context = (error.validationContext ?? 'body') as ValidationContext;
      const { code, message } = VALIDATION_ERRORS[context];
      const details = error.validation.map((issue) => ({
        field: issue.instancePath.replace(/^\//, '').replaceAll('/', '.') || null,
        message: issue.message,
      }));
      return sendError(request, reply, 400, code, message, details);
    }

    // Safety net: the service layer checks for duplicates first, but the
    // database's UNIQUE constraints are the real guarantee.
    if (isUniqueConstraintViolation(error)) {
      return sendError(request, reply, 409, 'CONFLICT', 'The resource already exists');
    }

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      const message = error instanceof Error ? error.message : 'Bad request';
      return sendError(request, reply, statusCode, FRAMEWORK_ERRORS[statusCode] ?? 'BAD_REQUEST', message);
    }

    request.log.error({ err: error }, 'Unhandled error');
    return sendError(request, reply, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  });

  app.setNotFoundHandler((request, reply) =>
    sendError(request, reply, 404, 'ROUTE_NOT_FOUND', `Route ${request.method} ${request.url} not found`),
  );
}
