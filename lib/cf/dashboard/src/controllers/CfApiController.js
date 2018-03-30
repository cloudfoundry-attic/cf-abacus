'use strict';
/* eslint-disable max-len*/
const logger = require('../utils/dashboardLogger');
const HttpClient = require('../utils/HttpClient');
const helper = require('../utils/HttpClientHelper');
const config = require('../config');
const Promise = require('bluebird');
const errors = require('../utils/errors');

class CfApiController {
  constructor() {
    this.httpClient = new HttpClient();
    this._domain = '';
  }

  getInfo() {
    logger.debug('CfApiController:: Fetching info details');
    let infoUrl = `${config.uris().api}/v2/info`;
    return this.httpClient.request(helper.generateRequestObject(
      'GET', infoUrl, '', {}, false));
  }

  getUserPermissions(request) {
    logger.debug('CfApiController:: Fetching user permisions');
    let guid = request.params.instance_id;
    let permissionEndpoint = `v2/service_instances/${guid}/permissions`;
    let permissionUrl = `${config.uris().api}/${permissionEndpoint}`;
    return this.httpClient.request(helper.generateRequestObject(
      'GET', permissionUrl, request.session.uaa_response.access_token
    ));
  }

  checkUserPermissionAndProceed(request) {
    return Promise.try(() => {
      return this.getUserPermissions(request).then((res) => {
        if (res.body.manage)
          return this.getServiceCredentials(request);
        logger.debug('Missing dashboard permissions');
        return Promise.reject(new errors.Forbidden('Missing required permissions for managing this Instance'));
      }).catch((error) => {
        logger.error(error);
        return Promise.reject(error);
      });
    });
  }

  getAccessToken(creds) {
    return this.httpClient.request({
      url: config.cf.token_url,
      rejectUnauthorized: !process.env.SKIP_SSL_VALIDATION,
      method: 'POST',
      json: true,
      form: {
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'grant_type': 'client_credentials'
      }
    });
  }

  getServiceCredentials(request) {
    let serviceKeysUrl = `${config.uris().api}/v2/service_instances/${request.params.instance_id}/service_keys`;
    return this.httpClient.request(helper.generateRequestObject('GET',serviceKeysUrl,request.session.uaa_response.access_token)).then((result) => {
      let serviceKeys = result.body;
      if(serviceKeys.total_results)
        return this.getDetailsForAbacusToken(serviceKeys,request);

      return this.getServiceBinding(request);
    });
  }


  getServiceBinding(request) {
    logger.debug('CfApiController:: Fetching service binding');
    let bindingsUrl = `${config.uris().api}/v2/service_instances/${request.params.instance_id}/service_bindings`;
    return this.httpClient.request(helper.generateRequestObject('GET', bindingsUrl,request.session.uaa_response.access_token)).then((serviceBindings) => {
      let bindings = serviceBindings.body;
      if (bindings.resources.length > 0)
        return this.getDetailsForAbacusToken(bindings,request);

      logger.error('Unable to find service keys or service bindings for this Instance. Either bind to an application or create a service key.');
      return Promise.reject(new errors.NotFound('Unable to find service keys or service bindings for this Instance. Either bind to an application or create a service key.'));
    });
  };

  getDetailsForAbacusToken(serviceResource,request) {
    let resource = serviceResource.resources[0];
    let metadata = resource.metadata;
    let guid = metadata.guid;
    let creds = resource.entity.credentials;
    request.session.creds = creds;
    request.session.guid = guid;
    let authResponse = this.getAccessToken(creds);
    return authResponse.then((authResponse) => {
      request.session.abacus_token = authResponse.body.access_token;
    }).catch((error) => {
      logger.error('Failed to get abacus token', error);
      return Promise.reject(new errors.InternalServerError('Internal Error'));
    });
  }
}

module.exports = CfApiController;
