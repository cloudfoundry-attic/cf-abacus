'use strict';

const { isEmpty } = require('underscore');

const edebug = require('abacus-debug')('e-abacus-usage-metering-routes');

const sanitize = (request) => {
  // TODO
};

module.exports = (retriever) =>
  async(request, response) => {
    const key = sanitize(request);

    try {
      const result = await retriever.retrieve(key);
      if(isEmpty(result))
        response.status(404).send();
      else
        response.status(200).send(result);
    } catch (e) {
      edebug('Failed to retrieve document %s due to %j', key, e);
      response.status(500).send('Unable to retrieve document');
    }
  };
