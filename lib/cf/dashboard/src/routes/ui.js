'use strict';
/* eslint-disable max-len*/
const express = require('express');
const passport = require('passport');
const authenticator = require('../middleware/authMiddleware');
const controller = require('../controllers').cfApi;
const router = express.Router();

router.get('/:instance_id', (req, res, next) => {
  if (authenticator.isAuthenticated(req))
    controller.checkUserPermissionAndProceed(req).then(() => {
      res.redirect(`/manage/instances/${req.params.instance_id}/bindings/${req.session.guid}/${req.session.creds.plans[0]}`);
    })
      .catch((error) => {
        return res.render('notfound', {
          'message': error.message
        });
      });
  else {
    let successRedirect = `${req.baseUrl}/${req.params.instance_id}`;
    passport.authenticate(
      'oauth2', {
        successReturnToOrRedirect: successRedirect,
        callbackURL: `${req.baseUrl}/${req.params.instance_id}`
      }
    )(req, res, next);
  }
});


router.get('/:instance_id/bindings/:binding_id/:plan_id',
  authenticator.ensureAuthenticated, (req, res) => {
    res.sendFile('home.html', {
      root: __dirname + '/../webapp/'
    });
  });

router.get('/:instance_id/bindings/:binding_id/metering/:plan_id*',
  authenticator.ensureAuthenticated, (req, res) => {
    res.redirect(`${req.baseUrl}/${req.params.instance_id}/bindings/${req.params.binding_id}/${req.params.plan_id}`);
  });

module.exports = router;

