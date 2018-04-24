'use strict';
const { each } = require('underscore');
const express = require('express');
const bodyParser = require('body-parser');
const debug = require('abacus-debug')('abacus-usage-meter-mock-server');

const setCallback = (alias, callback, app) => {
  app.all(alias, (req, resp) => callback(req, resp));
};

const addResponse = (alias, response, responseMap, position) => {
  let resp = responseMap.get(alias);
  if (!resp)
    resp = {
      index: 0,
      responses: [],
      callCount: 0
    };

  if(position)
    resp.responses[position] = response;
  else
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
        return resp.responses[resp.index++];
      }
      return 'Not found';
    };

    app.all('/batch', (req, res) => {
      // console.log(req.body[0]);
      const result = [];
      for (let r of req.body)
        result.push(getNextResponse(r.uri));
      res.status(200).send(result);

    });

    return {
      // addAlias: (alias) => addAlias(alias, app, cb),
      reset: (name) => server.close(() => debug(`Server ${name} stopped`)),
      returns: {
        onFirstCall: (alias, response) => addResponse(alias, response, responseMap, 0),
        onSecondCall: (alias, response) => addResponse(alias, response, responseMap, 1),
        series: (alias, responses) => each(responses, (response) => addResponse(alias, response, responseMap))
      },
      setCallback: (alias, callback) => setCallback(alias, callback, app),
      startApp: (port) => {
        server = app.listen(port, () => debug('Server started'));
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
