'use strict';

const { isEmpty } = require('underscore');
const httpStatusCodes = require('http-status-codes');

const dbClient = require('abacus-dbclient');
const oauth = require('abacus-oauth');

const edebug = require('abacus-debug')('e-abacus-usage-metering-routes');

const secured = () => process.env.SECURED === 'true';

const resourceIdIndex = 3;

const expectedScope = (request) => {
  const elements = request.params.key.split('/');
  return {
    system: [ 'abacus.usage.read' ],
    resource: [ `abacus.usage.${elements[resourceIdIndex]}.read` ]
  };
};

const authorize = (req, scope) => {
  if (secured())
    oauth.authorize(req && req.headers && req.headers.authorization, scope);
};

// NB: autorizeOldCollectedUsage should be removed after collectors retention period
const autorizeOldCollectedUsage = (req, res, doc) => {
  const scopes = {
    system: [ 'abacus.usage.read' ],
    resource: [ `abacus.usage.${doc.resource_id}.read` ]
  };
  if (secured())
    oauth.authorize(req && req.headers && req.headers.authorization, scopes);

};

module.exports = (retriever) => async(request, response) => {

  const oldCollectorInput = request.params.key.split('/')[resourceIdIndex];

  // NB: oldCollectorInput should be removed after collectors retention period
  if (oldCollectorInput) {
    authorize(request, expectedScope(request));

    try {
      const result = await retriever.retrieve(dbClient.tkuri(request.params.key, request.params.time));
      if(isEmpty(result))
        response.status(httpStatusCodes.NOT_FOUND).send();
      else
        response.status(httpStatusCodes.OK).send(result);

    } catch (e) {
      edebug('Failed to retrieve document %s due to %o', request.params.key, e);
      response.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send('Unable to retrieve document');
    }
  // NB: else part should be removed after collectors retention period
  } else {
    const result = await retriever.retrieve(dbClient.tkuri(request.params.key, request.params.time));
    if(isEmpty(result))
      response.status(httpStatusCodes.NOT_FOUND).send();
    else {
      autorizeOldCollectedUsage(request, response, result);
      response.status(httpStatusCodes.OK).send(result);
    }
  }
};

