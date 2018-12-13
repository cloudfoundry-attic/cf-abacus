'use strict';

const dbClient = require('abacus-dbclient');

module.exports.createMeterId = (usageDoc) => {
  const keyFields = [
    't',
    dbClient.pad16(usageDoc.end),
    'k',
    usageDoc.organization_id,
    usageDoc.space_id,
    usageDoc.consumer_id,
    usageDoc.resource_id,
    usageDoc.plan_id,
    usageDoc.resource_instance_id
  ];

  if(usageDoc.dedup_id)
    keyFields.push(usageDoc.dedup_id);

  return keyFields.join('/');
};
