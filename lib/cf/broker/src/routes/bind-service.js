'use strict';

const uaa = require('../auth/uaa.js');
const config = require('../config.js');

const bind = (req, res) => {
  const clientId = config.getClientId(req.params.instance_id,
    req.params.binding_id);
  uaa.createClient(clientId, req.params.instance_id, (statusCode, result) => {
    if (result.credentials) {
      result.credentials.resource_id = req.params.instance_id;
      result.credentials.plans = [
        config.generatePlanId(req.params.instance_id, req.params.instance_id)
      ];
    }

    res.status(statusCode).send(result);
  });
};

module.exports = bind;
