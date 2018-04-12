'use strict';

/* eslint-disable max-len*/

const cssParser = require('css');
const fs = require('fs');;

class ThemeValidator {
  constructor() {}

  validateCSS(filePath,fileName) {
    let message;
    let data = fs.readFileSync(filePath, 'utf-8');
    try {
      cssParser.parse(data, {
        source: fileName
      });
    }catch (exception) {
      message = exception.message;
    }
    return message;
  }
}
module.exports = ThemeValidator;
