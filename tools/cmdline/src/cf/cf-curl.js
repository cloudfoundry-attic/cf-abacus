'use strict';
/* istanbul ignore file */

const execute = require('../cmdline.js').execute;

const get = (path) => JSON.parse(execute(`cf curl ${path}`));

const getSingleResult = (path) => {
  const response = get(path);
  if (!response || !response.total_results || response.total_results !== 1)
    throw new Error(`Invalid response. Expected single result but received: ${JSON.stringify(response)}`);

  return response.resources[0];
};

module.exports = {
  get,
  getSingleResult,
  post: (path, body) => JSON.parse(execute(`cf curl -X POST ${path} -d '${JSON.stringify(body)}'`)),
  put: (path, body) => JSON.parse(execute(`cf curl -X PUT ${path} -d '${JSON.stringify(body)}'`)),
  delete: (path) => {
    execute(`cf curl -X DELETE ${path}`);
  }
};
