'use-strict';

const request = require('abacus-request');


module.exports = (url) => {
  const getCredentials = (cb) => request.get(`${url}/credentials`, (err, response) => {
    if (err)
      return cb(err);

    return cb(undefined, response.body);
  });

  const postUsage = (usageBody, cb) => request.post(`${url}/usage`, {
    body: usageBody
  }, cb);

  return {
    getCredentials,
    postUsage
  };
};
