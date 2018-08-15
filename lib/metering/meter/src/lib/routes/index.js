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

// TODO: remove autorizeOldCollectedUsage after collectors retention period
const autorizeOldCollectedUsage = (req, doc, secured) => {
  const scopes = {
    system: [ 'abacus.usage.read' ],
    resource: [ `abacus.usage.${doc.resource_id}.read` ]
  };
  if (secured)
    oauth.authorize(req && req.headers && req.headers.authorization, scopes);
};

module.exports = (retriever, secured) => async(request) => {

  // TODO: reading from old collector input DB should be removed after collectors retention period
  const oldCollectorInput = request.params.key.split('/')[resourceIdIndex];
  if (oldCollectorInput) {
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
  }

  // TODO: remove after collectors retention period
  const result = await retriever.retrieve(dbClient.tkuri(request.params.key, request.params.time));
  if(isEmpty(result))
    return {
      statusCode: httpStatusCodes.NOT_FOUND
    };
  autorizeOldCollectedUsage(request, result, secured);
  return {
    statusCode: httpStatusCodes.OK,
    body: result
  };
};

