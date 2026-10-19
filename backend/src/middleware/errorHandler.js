const logger = require('../config/logger');

/**
 * Standard error response builder
 * Ensures consistent error envelope across all routes
 */
function buildErrorResponse(status, code, message, fields = undefined) {
  return {
    error: {
      code,
      message,
      ...(fields && { fields }),
    },
  };
}

/**
 * HTTP status code to error code mapping
 */
function getErrorCodeForStatus(status) {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 500:
      return 'INTERNAL_ERROR';
    case 502:
      return 'BAD_GATEWAY';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}

/**
 * Helper to send standardized error response
 */
function sendErrorResponse(res, status, message, fields = undefined, customCode = undefined) {
  const code = customCode || getErrorCodeForStatus(status);
  res.status(status).json(buildErrorResponse(status, code, message, fields));
}

function normalizeErrorResponse(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function json(body) {
    if (res.statusCode >= 400) {
      if (body && typeof body.error === 'string') {
        body = { error: { code: 'ERROR', message: body.error, fields: undefined } };
      } else if (body && body.error && typeof body.error === 'object' && !body.error.code) {
        body = {
          ...body,
          error: {
            code: 'ERROR',
            message: body.error.message || JSON.stringify(body.error),
            fields: body.error.fields,
          },
        };
      }
    }
    return originalJson(body);
  };

  next();
}

function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const isServerError = status >= 500;
  const message = isServerError && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Unexpected error';
  const code = err.code || getErrorCodeForStatus(status);
  const payload = {
    code,
    message,
  };

  if (err.fields) {
    payload.fields = err.fields;
  }

  logger.error('Unhandled request error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    status,
  });

  res.status(status).json({ error: payload });
}

module.exports = { 
  normalizeErrorResponse, 
  errorHandler, 
  buildErrorResponse, 
  sendErrorResponse,
  getErrorCodeForStatus 
};
