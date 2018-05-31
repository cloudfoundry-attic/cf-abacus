'use strict';

const { pick, omit } = require('underscore');

module.exports = (internalApplications) => {
  return {
    internalComponents: (applicationsHealth) => {
      if(internalApplications)
        return pick(applicationsHealth, internalApplications);
      return applicationsHealth;
    },
    externalComponents: (applicationsHealth) => {
      if(internalApplications)
        return omit(applicationsHealth, internalApplications);
      return applicationsHealth;
    }
  };
};
