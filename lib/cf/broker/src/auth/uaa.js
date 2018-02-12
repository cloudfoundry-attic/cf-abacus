'use strict';

const abacusRequest = require('abacus-request');
const generator = require('generate-password');
const httpStatus = require('http-status-codes');

const oauth = require('../auth/oauth.js');
const config = require('../config.js');

const retry = require('abacus-retry');
const throttle = require('abacus-throttle');
const breaker = require('abacus-breaker');


const throttleLimit = process.env.THROTTLE ? parseInt(process.env.THROTTLE) :
  100;

// if a batch is throttled, then throttle limits the number of calls made to
// the batch function limiting the number of batches. In order to avoid that
// all the batch functions when throttled should have a throttle value that is
// multiplied by the batch.
const request = throttle(retry(breaker(abacusRequest)), throttleLimit);

const debug = require('abacus-debug')('abacus-broker');
const edebug = require('abacus-debug')('e-abacus-broker');

const createClient = (clientId, resourceId, cb) => {
  const scopes = ['abacus.usage.' + resourceId + '.read',
    'abacus.usage.' + resourceId + '.write'];
  const secret = generator.generate({
    length: 10,
    numbers: true
  });

  debug('Creating UAA client with id %s ', clientId);
  request.post(config.uris().auth_server + '/oauth/clients', {
    headers: oauth.authHeader(oauth.CLIENT_REGISTRATION_TOKEN),
    body: {
      scope : scopes,
      client_id : clientId,
      client_secret : secret,
      resource_ids : [ ],
      authorized_grant_types : [ 'client_credentials' ],
      authorities : scopes,
      autoapprove : true
    }
  }, (err, res) => {
    if(err) {
      edebug('Could not create UAA client %s due to %o', clientId, err);
      cb(httpStatus.INTERNAL_SERVER_ERROR, {});
    } else if (res.statusCode !== httpStatus.CREATED) {
      edebug('Could not create UAA client %s due to %s, %o',
        clientId, res.statusCode, res.body);
      cb(res.statusCode, {});
    } else {
      debug('Successfully created UAA client %s', clientId);
      cb(res.statusCode, {
        credentials: {
          client_id: clientId,
          client_secret: secret,
          collector_url: config.uris().collector + config.usageCollectorPath
        }
      });
    }
  });
};

const deleteClient = (clientId, cb) => {
  debug('Deleting UAA client with id %s', clientId);
  request.delete(config.uris().auth_server + '/oauth/clients/' + clientId, {
    headers: oauth.authHeader(oauth.CLIENT_REGISTRATION_TOKEN)
  }, (err, res) => {
    if(err) {
      edebug('Could not delete UAA client %s due to %o', clientId, err);
      cb(httpStatus.INTERNAL_SERVER_ERROR);
    } else if (res.statusCode === httpStatus.NOT_FOUND) {
      debug('UAA client %s not found', clientId);
      cb(httpStatus.OK);
    } else if (res.statusCode === httpStatus.OK) {
      debug('Successfully deleted UAA client %s', clientId);
      cb(res.statusCode);
    } else {
      edebug('Could not delete UAA client %s due to %s, %o',
        clientId, res.statusCode, res.body);
      cb(res.statusCode);
    }
  });
};

module.exports.createClient = createClient;
module.exports.deleteClient = deleteClient;
