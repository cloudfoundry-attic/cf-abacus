'use strict';

// Small utility that resolves URIs using the application environment. On
// CloudFoundry URIs are resolved using the route URI from the VCAP_APPLICATION
// env variable.

const _ = require('underscore');
const vcap = require('abacus-vcapenv');

const object = _.object;
const map = _.map;
const keys = _.keys;

// Setup debug log
const debug = require('abacus-debug')('abacus-urienv');

// Return the default protocol to use
const defprotocol = () => process.browser ? window.location.protocol : 'http:';

// Return the default host to use
const defhost = () => process.browser ? window.location.hostname : 'localhost';

// Return the default port to use
const defport = () => process.browser ? window.location.port : process.env.PORT ? process.env.PORT : 9080;

// Convert an alias to a value optionally configured in an environment
// variable
const env = (alias) => process.env[alias.replace('-', '_').toUpperCase()];

// Compute the URL of an app, use like this: resolve.url('abc', 'http://localhost:1234')
// will return 'http://abc.bluemix.net' in an app mapped to 'xyz.bluemix.net'
// and 'http://localhost:1234' otherwise
const url = (alias, def) => {
    const uris = (vcap.env() || {}).application_uris;
    if(uris !== undefined && uris.length) {
        // In the cloud, concatenate the app's subdomain name and the hosting
        // cloud platform domain
        const e = env(alias) || alias;
        if(/:/.test(e)) {
            debug('Resolved env %s %s to %s', alias, def, e);
            return e;
        }
        const target = 'https:' + '//' + e + '.' + uris[0].split('.').slice(1).join('.');
        debug('Resolved app route %s %s to %s', alias, def, target);
        return target;
    }

    // In a local environment, just use a default protocol, host and the
    // given port
    const e = env(alias);
    if(e) {
        debug('Resolved env %s %s to %s', alias, def, e);
        return e;
    }
    const target = typeof def === 'number' ? defprotocol() + '//' + defhost() + ':' + def :
        def || defprotocol() + '//' + defhost() + (defport() !== '' ? ':' + defport() : '');
    debug('Resolved local %s %s to %s', alias, def, target);
    return target;
};

// Compute the URLs of a collection of apps, use like this: resolve({ abc: 'http://localhost:1234', def: 4567, ghi: undefined })
// will return { abc: 'http://abc.bluemix.net', def: 'http://def.bluemix.net', ghi: 'http://ghi.bluemix.net' } in an app mapped to 'xyz.bluemix.net'
// and { abc: 'http://localhost:1234', def: 'http://localhost:4567', ghi: 'http://localhost:8080' } otherwise
const resolve = (apps) => object(map(keys(apps), (k) => [k, url(k, apps[k])]));

// Export our public functions
module.exports = resolve;
module.exports.resolve = resolve;
module.exports.url = url;

