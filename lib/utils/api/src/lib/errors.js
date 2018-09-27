'use strict';

const http = require('http');

class APIError extends Error {
  constructor(message) {
    super(`api error: ${message}`);
  }
};

class UnavailableForLegalReasonsError extends APIError {
  constructor() {
    super(http.STATUS_CODES[451].toLowerCase());
  }
};

class TooManyRequestsError extends APIError {
  constructor(retryAfter) {
    super(http.STATUS_CODES[429].toLowerCase());
    this.retryAfter = retryAfter;
  }
};

class ConflictError extends APIError {
  constructor() {
    super(http.STATUS_CODES[409].toLowerCase());
  }
};

module.exports = {
  APIError,
  UnavailableForLegalReasonsError,
  TooManyRequestsError,
  ConflictError
};
