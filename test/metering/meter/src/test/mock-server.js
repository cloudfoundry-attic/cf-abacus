'use strict';
const { each } = require('underscore');
const express = require('express');
const bodyParser = require('body-parser');
const debug = require('abacus-debug')('abacus-usage-meter-mock-server');

const setCallback = (alias, callback, app) => {
  app.all(alias, (req, resp) => callback(req, resp));
};

const addResponse = (alias, response, responseMap) => {
  let resp = responseMap.get(alias);

  if (!resp)
    resp = {
      index: 0,
      responses: [],
      callCount: 0
    };

  resp.responses.push(response);

  responseMap.set(alias, resp);
};

module.exports = {
  app: () => {
    const responseMap = new Map();
    const app = express();

    let server;

    app.use(bodyParser.json());

    const getNextResponse = (alias) => {
      const resp = responseMap.get(alias);
      if (resp) {
        if (resp.index === resp.responses.length)
          resp.index = 0;
        resp.callCount++;
        return { statusCode: 200, body: resp.responses[resp.index++] };
      }
      return { statusCode: 404 };
    };

    app.post('/batch', (req, res) => {
      const result = [];
      let statusCode = 200;
      for (let r of req.body) {
        const response = getNextResponse(r.uri);
        if(response.statusCode !== 200)
          statusCode = response.statusCode;
        result.push(response.body);
      }
      res.status(statusCode).send(result);
    });

    return {
      reset: () => responseMap.clear(),
      close: () => new Promise((resolve) => server.unref().close(resolve)),
      returns: (alias, responses) => each(responses, (response) => addResponse(alias, response, responseMap)),
      setCallback: (alias, callback) => setCallback(alias, callback, app),
      startApp: (port) => {
        server = app.listen(port, () => debug('Server started'));

        // destroy test server sockets immediately to speed-up server close
        server.on('request', (request, response) => {
          response.on('finish', () => request.socket.destroy());
        });
      },
      getCallCount: (alias) => {
        const resp = responseMap.get(alias);
        if (resp)
          return resp.callCount;
        return 0;
      },
      waitUntil: {
        alias: (alias) => ({
          isCalled: async(times) => {
            const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

            while(responseMap.get(alias).callCount !== times)
              await sleep(100);
          }
        })
      }
    };
  }
};
