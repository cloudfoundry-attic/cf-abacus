'use strict';

const jwt = require('jsonwebtoken');

const token = (tokenSecret) => {
  const create = (scopes) => {
    const payload = {
      scope: scopes
    };
    return jwt.sign(payload , tokenSecret, {
      expiresIn: 43200
    });
  };

  return {
    create
  };
};

module.exports = token;
