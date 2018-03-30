'use strict';

const uaa = require('../auth/uaa.js');
const config = require('../config.js');

const deleteUaaClient = (clientId, cb) => {
  uaa.deleteClient(clientId, cb);
};

const unbind = (req, res) => {
  const clientId = config.getClientId(req.params.instance_id,
    req.params.binding_id);
  deleteUaaClient(clientId, (statusCode) => {
    res.status(statusCode).send({});
  });
};

module.exports = unbind;
module.exports.deleteUaaClient = deleteUaaClient;
