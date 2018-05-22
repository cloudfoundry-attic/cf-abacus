'use strict';

const { isEmpty } = require('underscore');
const httpStatusCodes = require('http-status-codes');

const dbClient = require('abacus-dbclient');
const oauth = require('abacus-oauth');

const edebug = require('abacus-debug')('e-abacus-usage-metering-routes');

const secured = () => process.env.SECURED === 'true';

const expectedScope = (request) => {
  const elements = request.params.key.split('/');
  return {
    system: [ 'abacus.usage.read' ],
    resource: [ `abacus.usage.${elements[3]}.read` ]
  };
};

const authorize = (req, scope) => {
  if (secured())
    oauth.authorize(req && req.headers && req.headers.authorization, scope);
};

module.exports = (retriever) => async(request, response) => {
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
};
