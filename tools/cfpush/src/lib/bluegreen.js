'use strict';

const { extend } = require('underscore');

const cp = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const tmp = require('tmp');
tmp.setGracefulCleanup();

const { originalManifestFilename } = require(`${__dirname}/constants.js`);

const prepareTmpDir = () => {
  const tmpDir = tmp.dirSync({
    prefix: 'cfpush_',
    discardDescriptor: true,
    unsafeCleanup: true
  });

  const cfTmpDir = path.join(tmpDir.name, '.cf');
  const cfHomeDir = path.join(process.env.CF_HOME || process.env.HOME, '.cf');

  if (fs.existsSync(cfHomeDir))
    fs.copySync(cfHomeDir, cfTmpDir);

  return tmpDir;
};

const executeCommand = (command, cb) => {
  const tmpDir = prepareTmpDir();
  const ex = cp.exec(command, {
    cwd: process.cwd(),
    env: extend({}, process.env, { CF_HOME: tmpDir.name })
  });
  ex.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
  ex.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  ex.on('close', (code) => {
    tmpDir.removeCallback();
    cb(code);
  });
};

const rename = (props, cb) => {
  const appName = `${props.prefix}${props.name}`;
  const command = `cf rename ${appName} ${appName}-old`;
  return executeCommand(command, cb);
};

const deleteOld = (props, cb) => {
  const appName = `${props.prefix}${props.name}`;
  const command = `cf delete -f ${appName}-old`;
  executeCommand(command, cb);
};

const prepareZdm = (props, cb) => {
  if (props.prepareZdm) {
    const appName = `${props.prefix}${props.name}`;
    const command = `cf app ${appName}`;
    executeCommand(command, (code) => {
      if (code > 0) return cb();
      return deleteOld(props, (error) => {
        if (error) return cb(error);
        return rename(props, cb);
      });
    });
  } else cb();
};

const push = (props, cb) => {
  const startParam = props.start ? '' : '--no-start';
  const manifestPath = `${props.path}/.cfpush/${props.name}-${originalManifestFilename}`;
  const command = `cf push ${startParam} -p ${props.path} -f ${manifestPath}`;

  executeCommand(command, cb);
};

const retryPush = (properties, cb) => {
  let retryAttempts = 0;

  const retryCb = (error) => {
    retryAttempts++;
    if (error && retryAttempts < properties.retries) {
      push(properties, retryCb);
      return;
    }

    cb(error);
  };

  push(properties, retryCb);
};

module.exports.prepareTmpDir = prepareTmpDir;
module.exports.prepareZdm = prepareZdm;
module.exports.push = retryPush;
