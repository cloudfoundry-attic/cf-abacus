'use strict';

const express = require('express');
const bodyParser = require('body-parser');

const process = (req, resp, alias) => {
  const result = getNextResponse(alias);
  console.log('>>>>>>>', result);
  resp.status(result.statusCode).send(result.body);
  if (cb)
    cb(req);
};

const addAlias = (alias, app, cb) => {
  app.all(alias, (req, resp) => process(req, resp, alias, cb));
};

const setCallback = (alias, callback, app) => {
  app.all(alias, (req, resp) => callback(req, resp));
};

const addResponse = (alias, response, responseMap) => {
  let resp = responseMap.get(alias);
  if (!resp)
    resp = {
      index: 0,
      responses: []
    };
  resp.responses.push(response);
  responseMap.set(alias, resp);
};

module.exports = {
  app: (cb) => {
    const responseMap = new Map();
    const app = express();
    app.use(bodyParser.json());

    const getNextResponse = (alias) => {
      const resp = responseMap.get(alias);
      if (resp) {
        if (resp.index === resp.responses.length)
          resp.index = 0;
        return resp.responses[resp.index++];
      }
      return 'Not found';
    };

    app.all('/batch', (req, res) => {
      const result = [];
      for (let r of req.body)
        result.push(getNextResponse(r.uri));
      console.log('BATCH! >>>> %j --- %j', req.body, result);
      res.status(200).send(result);
      if (cb)
        cb(req);
    });

    return {
      addAlias: (alias) => addAlias(alias, app, cb),
      addResponse: (alias, response) => addResponse(alias, response, responseMap),
      setCallback: (alias, callback) => setCallback(alias, callback, app),
      startApp: (port) => app.listen(port)
    };
  }
};
// addAlias('/test');
// addResponse('/test', { statusCode: 200, msg: 'Test response' });
// addResponse('/test', { statusCode: 201, msg: 'Test response2' });
// addResponse('/test', 'Test response 3');
// app.listen(2222);
// module.exports.startApp = startApp;
// module.exports.addResponse = addResponse;
// module.exports.addAlias = addAlias;




