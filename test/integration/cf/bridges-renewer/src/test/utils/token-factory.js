'use strict';

const jwt = require('jsonwebtoken');
const expiresIn = 43200;

const token = (tokenSecret) => {
  const create = (scopes) => {
    const payload = {
      scope: scopes
    };
    return jwt.sign(payload, tokenSecret, {
      expiresIn
    });
  };

  return {
    create
  };
};

module.exports = token;
