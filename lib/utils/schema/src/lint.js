'use strict';

const _ = require('underscore');
const path = require('path');
const CLIEngine = require('eslint').CLIEngine;
const linter = require('eslint').linter;

const memoize = _.memoize;

const debug = require('abacus-debug')('abacus-schema');

// Lint the specified JS code using the specified ESLint config file
const lint = (code, eslintConfigFile) => {
  const configFile = eslintConfigFile ||
    path.resolve(__dirname, '../config/.eslintrc');

  // Get an ESLint configuration from the config file
  // Memoize to avoid loading the same config file more than once
  const getConfig = memoize((conifgFile) => {
    const cli = new CLIEngine({
      configFile: configFile,
      fix: false
    });
    return cli.getConfigForFile(__filename);
  });
  const config = getConfig(configFile);

  // Verify the code
  debug('Executing ESLint on code %s', code);
  const messages = linter.verify(code, config, {
    allowInlineConfig: false
  });
  debug('ESLint messages: %o', messages);

  // Filter only fatal and error messages and return an appropriate result
  const errors = messages.filter((m) => m.fatal || m.severity === 2);
  return {
    ok: errors.length === 0,
    errors: errors
  };
};

module.exports = lint;
