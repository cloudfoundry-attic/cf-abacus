const bodyParser = require('body-parser');
const express = require('express');

const app = express();

const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const data = new Map();

const getMissingProperties = (body) => {
  const expectedProperties = ['organization_guid', 'space_guid', 'service_name', 'service_plan_name'];
  const missingProperties = [];
  for(let property of expectedProperties)
    if(!body.hasOwnProperty(property))
      missingProperties.push(property);

  return missingProperties;
};

const updateMapping = (req, res) => {
  const resource = req.params.resource;
  const plan = req.params.plan;

  console.log(`Test mapping api ${req.method}: resource: ${resource}, plan: ${plan} and body: %j`, req.body);

  const missingProperties = getMissingProperties(req.body);
  if (missingProperties.length !== 0) {
    const errorMessage = `No '${missingProperties}' found in request body`;
    console.error(errorMessage);
    return res.status(500).send(errorMessage);
  }

  data.set({resource, plan}, req.body);
  console.log('Data', data);
  return res.status(200).send();
};

app.post('/v1/provisioning/mappings/services/resource/:resource/plan/:plan',
  (req, res) => updateMapping(req, res));

 app.put('/v1/provisioning/mappings/services/resource/:resource/plan/:plan',
  (req, res) => updateMapping(req, res));

app.get('/v1/provisioning/mappings/services', (req, res) => {
  console.log('Test mapping api GET current data: %o', data);
  res.status(200).json(Array.from(data));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
