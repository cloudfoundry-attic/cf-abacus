'use strict';

const create = (allowedOrgs) =>
  (event) => !allowedOrgs.includes(event.entity.org_guid);

module.exports = create;
