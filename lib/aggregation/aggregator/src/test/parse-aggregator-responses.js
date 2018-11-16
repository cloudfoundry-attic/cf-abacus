'use strict';

const currentMonthWindow = (request) => request.body.resources[0].plans[0].aggregated_usage[0].windows[4][0];

const previousMonthWindow = (request) => request.body.resources[0].plans[0].aggregated_usage[0].windows[4][1];

const currentDayWindow = (request) => request.body.resources[0].plans[0].aggregated_usage[0].windows[3][0];

const previousDayWindow = (request) => request.body.resources[0].plans[0].aggregated_usage[0].windows[3][1];
        
module.exports = {
  currentMonthWindow,
  previousMonthWindow,
  currentDayWindow,
  previousDayWindow
};
