'use strict';

const httpStatus = require('http-status-codes');

class APIError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
};

class BadRequestError extends APIError {
  constructor(message) {
    super(httpStatus.BAD_REQUEST, message);
  }
};

class UnauthorizedError extends APIError {
  constructor(message) {
    super(httpStatus.UNAUTHORIZED, message);
  }
};

class ForbiddenError extends APIError {
  constructor(message) {
    super(httpStatus.FORBIDDEN, message);
  }
};

class ConflictError extends APIError {
  constructor(message) {
    super(httpStatus.CONFLICT, message);
  }
};

class UnprocessableEntityError extends APIError {
  constructor(message) {
    super(httpStatus.UNPROCESSABLE_ENTITY, message);
  }
};

class TooManyRequestsError extends APIError {
  constructor(retryAfter, message) {
    super(httpStatus.TOO_MANY_REQUESTS, message);
    this.retryAfter = retryAfter;
  }
};

class UnavailableForLegalReasonsError extends APIError {
  constructor(message) {
    super(451, message);
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
