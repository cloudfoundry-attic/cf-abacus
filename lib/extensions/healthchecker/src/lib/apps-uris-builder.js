'use strict';

const util = require('util');
const yieldable = require('abacus-yieldable');
const debug = require('abacus-debug')('abacus-healthchecker');
const appuri = util.promisify(yieldable.functioncb(require('abacus-dataflow').sink));


module.exports = (urienv) => {

  const getGroupUri = (name) => {
    return urienv.url(name);
  };

  const buildUris = async(groupName, appsCount) => {
    let appUris = [];
    for (let i = 0; i < appsCount; i++) {
      const uriPartition = () => function*() {
        return appsCount > 1 ? [i] : false;
      };
      const groupUri = getGroupUri(groupName);
      const appUri = await appuri(undefined, groupUri, uriPartition);
      appUris.push(appUri);
    }

    debug('Calculated applications uris for group "%s" and applications count "%d": %j', groupName, appsCount, appUris);
    return appUris;
  };

  return {
    buildUris
  };
};
