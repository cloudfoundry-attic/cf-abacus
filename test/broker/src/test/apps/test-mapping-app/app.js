const bodyParser = require('body-parser');
const express = require('express');

const app = express();

const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const data = [];

const getMissingProperties = (body) => {
  const expectedProperties = ['organization_guid', 'space_guid', 'service_name', 'service_plan_name'];
  const missingProperties = [];
  for(let property of expectedProperties)
    if(!body.hasOwnProperty(property))
      missingProperties.push(property);

  return missingProperties;
};

app.post('/v1/provisioning/mappings/services/resource/:resource/plan/:plan', (req, res) => {
  const resource = req.params.resource;
  const plan = req.params.plan;

  console.log(`Test mapping api POST : resource: ${resource} and plan: ${plan}`);

  const missingProperties = getMissingProperties(req.body);
  if (missingProperties.length == 0) {
    data.push([{ resource, plan }, req.body]);
    return res.status(200).send();
  }

  return res.status(500).send(`No '${missingProperties}' found in request body`);
});

app.get('/v1/provisioning/mappings/services', (req, res) => {
  console.log('Test mapping api GET : current data: %j', data);
  res.status(200).send(data);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
