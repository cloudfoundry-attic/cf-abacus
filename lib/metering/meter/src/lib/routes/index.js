'use strict';

const { isEmpty } = require('underscore');
const httpStatusCodes = require('http-status-codes');

const oauth = require('abacus-oauth');
const dbClient = require('abacus-dbclient');

const edebug = require('abacus-debug')('e-abacus-usage-metering-routes');

const resourceIdIndex = 3;

const expectedScope = (request) => {
  const elements = request.params.key.split('/');
  return {
    system: [ 'abacus.usage.read' ],
    resource: [ `abacus.usage.${elements[resourceIdIndex]}.read` ]
  };
};

const authorize = (req, scope, secured) => {
  if (secured)
    oauth.authorize(req && req.headers && req.headers.authorization, scope);
};

module.exports = (retriever, secured) => async(request) => {
  authorize(request, expectedScope(request), secured);

  try {
    const result = await retriever.retrieve(dbClient.tkuri(request.params.key, request.params.time));
    if(isEmpty(result))
      return {
        statusCode: httpStatusCodes.NOT_FOUND
      };

    return {
      statusCode: httpStatusCodes.OK,
      body: result
    };
  } catch (e) {
    edebug('Failed to retrieve document %s due to %o', request.params.key, e);
    return {
      statusCode: httpStatusCodes.INTERNAL_SERVER_ERROR,
      body: 'Unable to retrieve document'
    };
  }
};

