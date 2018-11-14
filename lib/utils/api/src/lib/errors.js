'use strict';

const httpStatus = require('http-status-codes');

class APIError extends Error {
  constructor(statusCode, message) {
    super(`Unexpected response status code: ${statusCode}`);
    this.statusCode = statusCode;
  }
};

class BadRequestError extends APIError {
  constructor() {
    super(httpStatus.BAD_REQUEST);
  }
};

class UnauthorizedError extends APIError {
  constructor() {
    super(httpStatus.UNAUTHORIZED);
  }
};

class ForbiddenError extends APIError {
  constructor() {
    super(httpStatus.FORBIDDEN);
  }
};

class ConflictError extends APIError {
  constructor() {
    super(httpStatus.CONFLICT);
  }
};

class UnprocessableEntityError extends APIError {
  constructor() {
    super(httpStatus.UNPROCESSABLE_ENTITY);
  }
};

class TooManyRequestsError extends APIError {
  constructor(retryAfter) {
    super(httpStatus.TOO_MANY_REQUESTS);
    this.retryAfter = retryAfter;
  }
};

class UnavailableForLegalReasonsError extends APIError {
  constructor() {
    super(451);
  }
};

module.exports = {
  APIError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UnprocessableEntityError,
  TooManyRequestsError,
  UnavailableForLegalReasonsError
};
