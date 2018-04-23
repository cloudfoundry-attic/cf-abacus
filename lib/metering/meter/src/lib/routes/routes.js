'use strict';

const { isEmpty } = require('underscore');
const dbClient = require('abacus-dbclient');
const httpStatusCodes = require('http-status-codes');

const edebug = require('abacus-debug')('e-abacus-usage-metering-routes');

module.exports = (retriever) =>
  async(request, response) => {

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
