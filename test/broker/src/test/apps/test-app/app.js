const express = require('express');
const bodyParser = require('body-parser');
const request = require('abacus-request');
const oauth = require('abacus-oauth');
const app = express();
require('request-debug')(request);

const port = process.env.PORT || 3000;

const servicesEnv = JSON.parse(process.env.VCAP_SERVICES);
const applicationEnv = JSON.parse(process.env.VCAP_APPLICATION);

const meteringServiceCredentials = servicesEnv[Object.keys(servicesEnv)[0]][0].credentials;

const clientId = meteringServiceCredentials.client_id;
const clientSecret = meteringServiceCredentials.client_secret;
const collectorURL = meteringServiceCredentials.collector_url;
const reportingURL = collectorURL.replace('collector', 'reporting').replace('collected/usage', 'organizations');
const resourceId = meteringServiceCredentials.resource_id;

const usageToken = oauth.cache(
  applicationEnv.cf_api,
  clientId,
  clientSecret,
  `abacus.usage.${resourceId}.write,abacus.usage.${resourceId}.read`
);

app.use(bodyParser.json());

app.get('/credentials', (req, res) => {
  res.status(200).send(meteringServiceCredentials);
});

app.get('/summary/:orgid', (req, res) => {
  console.log(`Requesting summary report for ${req.params.orgid}`);
  request.get(`${reportingURL}/${req.params.orgid}/aggregated/usage`, {
    headers: {
      'Authorization': usageToken()
    }
  }, (error, response) => {
    if (error) {
      console.log(`Error getting report: ${error}`);
      res.status(500).send(error);
      return;
    }
    res.status(response.statusCode).send(response.body);
  });
});

app.post('/usage', (req, res) => {
  const usage = req.body;
  console.log(`Posting usage ${JSON.stringify(usage)} to collector ${collectorURL}`);
  request.post({
    uri: collectorURL,
    headers: {
      'Authorization': usageToken()
    },
    body: usage
  }, (error, response) => {
    if (error) {
      console.log(`Error posting usage: ${error}`);
      res.status(500).send(error);
      return;
    }
    res.status(response.statusCode).send(response.message);
  });
});

usageToken.start(() => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
});
