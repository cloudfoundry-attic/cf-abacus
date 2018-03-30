'use strict';

const generateRequestObject = (method, url, accessToken, body, async) => {
  return {
    method: method,
    url: url,
    rejectUnauthorized: !process.env.SKIP_SSL_VALIDATION,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-cache',
      'Authorization': `bearer ${accessToken}`
    },
    body: body || null,
    json: true,
    async: async || true
  };
};

exports.generateRequestObject = generateRequestObject;
