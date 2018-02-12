'use strict';

const uiJson = require('./frontend/coverage/coverage.json');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');

fs.readFile(path.join(`${__dirname}`, '../../.coverage/coverage.json'),
  'utf-8',
  function(err, data) {
    if (err) throw err;
    let backJson = JSON.parse(data);
    backJson = _.assign(backJson, uiJson);
    fs.writeFile(path.join(`${__dirname}`, '../../.coverage/coverage.json'),
      JSON.stringify(backJson), 'utf-8',
      function(err) {
        if (err) throw err;
        console.log('Done!');
      });
  });
