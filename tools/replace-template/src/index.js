'use strict';

// Replace manifest.yml template using credentials file or environment variables

const commander = require('commander');
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const yaml = require('js-yaml');

let credentialsFile;
let abacusConfigDir;

const parseCommandLineArgs = (args) => {
  commander
    .arguments('<abacus-config-directory> [credentials-file]')
    .action(function(configDir, credentials) {
      abacusConfigDir = configDir;
      credentialsFile = credentials;
    })
    .parse(args);
};

const escapeRegExp = (str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');

const replaceAll = (str, find, replace) => str.replace(new RegExp(escapeRegExp(find), 'g'), replace);

const replaceValues = (root, credentials, credentialsKey) => {
  if (!root) return;

  for (let key in root)
    if (root.hasOwnProperty(key)) {
      const value = root[key];
      if (typeof value === 'string') root[key] = replaceAll(value, credentialsKey, credentials[credentialsKey]);
      if (typeof value === 'object') replaceValues(value, credentials, credentialsKey);
    }
};

const replaceFiles = (credentials, files) => {
  console.log('Substituting in:');
  for (let templateFile of files)
    fs.readFile(templateFile, 'utf8', function(err, content) {
      if (err) throw err;

      const templateYml = yaml.load(content);

      for (let credentialsKey in credentials)
        if (credentials.hasOwnProperty(credentialsKey))
          replaceValues(templateYml.applications, credentials, credentialsKey);

      const templatePath = path.dirname(templateFile);
      const templateBaseName = path.basename(templateFile);
      const manifestBaseName = templateBaseName.replace(/\.template/g, '');
      const manifestFile = path.join(templatePath, manifestBaseName);

      const manifestContent = yaml.dump(templateYml);
      fs.writeFile(manifestFile, manifestContent, 'utf8', (err) => {
        if (err) throw err;
      });
      console.log('   %s', manifestFile);
    });
};

const runCLI = () => {
  parseCommandLineArgs(process.argv);

  if (typeof abacusConfigDir === 'undefined') {
    console.error('No abacus-config directory specified!');
    process.exit(1);
  }
  if (!fs.statSync(abacusConfigDir).isDirectory()) {
    console.error('Invalid abacus-config directory %s specified!', abacusConfigDir);
    process.exit(1);
  }
  console.log('Abacus config: %s', abacusConfigDir);

  const credentials = [];
  if (credentialsFile) {
    console.log('Using credentials file: %s', credentialsFile);
    fs.readFile(credentialsFile, 'utf8', (err, content) => {
      if (err) throw err;

      const credentialsYml = yaml.load(content);
      for (let key in credentialsYml)
        if (credentialsYml.hasOwnProperty(key)) {
          const envVariableName = '$' + key.toUpperCase().replace(/-/g, '_');
          credentials[envVariableName] = credentialsYml[key];
        }
    });
  } else {
    console.log('Using environment variables');
    for (let key in process.env)
      if (process.env.hasOwnProperty(key)) {
        const envVariableName = '$' + key;
        credentials[envVariableName] = process.env[key];
      }
  }

  glob(abacusConfigDir + '/lib/**/manifest.yml.template', (err, files) => {
    if (err) throw err;
    replaceFiles(credentials, files);
  });
};

// Export our CLI
module.exports.runCLI = runCLI;
