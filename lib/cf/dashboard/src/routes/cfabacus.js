'use strict';

const express = require('express');
const controller = require('../controllers').cfAbacusApi;
const router = express.Router();
const authenticator = require('../middleware/authMiddleware');

router.get('/metering/plans/:plan_id',
  authenticator.ensureAuthenticated, (request, response) => {
    controller.getMeteringPlan(request).then((data) => {
      response.status(data.statusCode).send(data.body);
    }).catch((error) => {
      response.status(error.status).send(error);
    });
  });

router.put('/metering/plans/:plan_id',
  authenticator.ensureAuthenticated, (request, response) => {
    controller.updateMeteringPlan(request).then((data) => {
      response.status(data.statusCode).send(data.body);
    }).catch((error) => {
      response.status(error.status).send(error);
    });
  });

router.put('/plans/:plan_id/metrics/:metric_id',
  authenticator.ensureAuthenticated, (request, response) => {
    controller.updateAllPlans(request).then((data) => {
      response.status(data.statusCode).send(data.body);
    }).catch((error) => {
      response.status(error.status).send(error);
    });
  });

router.get('/metering/usage_doc/:plan_id',
  authenticator.ensureAuthenticated, (request,response) => {
    controller.getUsageDocument(request).then((resp) => {
      response.status(200).send(resp);
    }).catch((error) => {
      response.status(error.status).send(error);
    });
  });

router.post('/collector/usage_doc',authenticator.ensureAuthenticated,
  (request,response) =>{
    controller.postUsageDocument(request).then((data) => {
      response.status(data.statusCode).send(data);
    }).catch((error) => {
      response.status(error.status).send(error);
    });
  });

module.exports = router;
