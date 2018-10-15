'use strict';

// Print an environment variable from a manifest.yml file

const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

// Return the value of an element
const element = (content, elements, cfgFile) => {
  let result = content;
  for(let element of elements) {
    result = result[element];
    if (result === undefined) {
      console.error('Element %s not found in path %s for manifest %s',
        element, elements.join('.'), cfgFile);
      process.exit(1);
    }
  }
  return result;
};

const runCLI = () => {
  const moduleName = process.argv[2];
  if (!moduleName) {
    console.error('No module name specified !');
    return;
  }

  const elements = process.argv.slice(3);
  if (elements.length === 0) {
    console.error('No elements specified !');
    return;
  }

  const cfgFile = path.join(moduleName, 'manifest.yml');
  fs.readFile(cfgFile, 'utf8', (err, content) => {
    if (err) {
      console.error(err);
      return;
    }

    const config = yaml.safeLoad(content, {filename: cfgFile});
    if(!config.applications) {
      console.error('Invalid application manifest: no applications');
      return;
    }

    const appConfig = config.applications[0];
    console.log(element(appConfig, elements, cfgFile));
  });
};

// Export our CLI
module.exports.runCLI = runCLI;
