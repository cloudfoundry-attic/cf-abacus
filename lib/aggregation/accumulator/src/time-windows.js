'use strict';


const _ = require('underscore');
const map = _.map;

const sec = 's';
const min = 'm';
const hour = 'h';
const day = 'D';
const month = 'M';

const dimension = {
  sec,
  min,
  hour,
  day,
  month
};

const slackscale = {
  [month]: { [month]: 1 },
  [day]:   { [month]: 28, [day]: 1 },
  [hour]:  { [month]: 672, [day]: 24, [hour]: 1 },
  [min]:   { [month]: 40320, [day]: 1440, [hour]: 60, [min]: 1 },
  [sec]:   { [month]: 2419200, [day]: 86400, [hour]: 3600, [min]: 60, [sec]: 1 }
};

module.exports = (slack, windowsSizes) => {

  const slackBasedWindows = (dimension) => {
    if(slack.scale && slackscale[slack.scale][dimension])
      return map(Array(Math.ceil(
        1 / slackscale[slack.scale][dimension] * slack.width) + 1),
  () => null);
    return [null];
  };

  return {
    getWindows: (dimension) => {
      if (windowsSizes && windowsSizes[dimension])
        return map(Array(windowsSizes[dimension]), () => null);
      return slackBasedWindows(dimension);
    }
  };
};
module.exports.dimension = dimension;

