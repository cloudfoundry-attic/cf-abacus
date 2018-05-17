'use strict';

const util = require('util');

const yieldable = require('abacus-yieldable');

const appuri = util.promisify(yieldable.functioncb(require('abacus-dataflow').sink));


module.exports = (urienv) => {

  const getGroupUri = (name) => {
    // if (domain) {
    //   const uri = `${protocol}//${name}.${domain}`;
    //   xdebug(`Group URI for ${name} resolved with domain to ${uri}`);
    //   return uri;
    // }

    // let uri;
    // if (process.env.APPLICATION_GROUPS) {
    //   uri = urienv.url(name);
    //   xdebug(`Group URI for ${name} resolved to ${uri}`);
    // } else {
    //   uri = uris()[name];
    //   xdebug(`Group URI for ${name} resolved with URIs %j to ${uri}`, uris());
    // }

    // return uri;

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
    return appUris;
  };

  return {
    buildUris
  };
};
