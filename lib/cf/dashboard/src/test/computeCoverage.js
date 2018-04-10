'use strict';
/* eslint-disable max-len*/
const fs = require('fs');
const jsdom = require('jsdom');
const $ = require('jquery')(jsdom.jsdom().defaultView);
const rmdir = require('rimraf');

let table;
let metrics = [];

jsdom.env('./test/frontend/coverage/index.html', (err, window) => {
  let rows = window.document.documentElement.getElementsByClassName('fraction');
  for (let cnt = 0; cnt < rows.length; cnt++) 
    metrics.push(rows[cnt].textContent);
  
  table = window.document.documentElement.getElementsByClassName('coverage-summary')[0].tBodies[0];
});

let stats = [];

const updateStats = (metrics, stats) => {
  for (let cnt = 0; cnt < metrics.length; cnt++) {
    let value = stats[cnt];
    let startCountUI = parseInt(value.substring(
      value.indexOf('(') + 1, value.indexOf('/') - 1));
    let endCountUI = parseInt(value.substring(
      value.indexOf('/') + 2, value.indexOf(')')));

    let startCountBackend = parseInt(metrics[cnt].substring(
      0, metrics[cnt].indexOf('/')));
    let endCountBackend = parseInt(metrics[cnt].substring(
      metrics[cnt].indexOf('/') + 1));

    let finalStartCount = startCountUI + startCountBackend;
    let finalEndCount = endCountUI + endCountBackend;

    let finalPercent = 0;
    if (finalEndCount != 0)
      finalPercent = (finalStartCount / finalEndCount * 100).toFixed(2);
    // update output in stats array
    stats[cnt] = `${finalPercent}% (${finalStartCount} / ${finalEndCount}) `;
  }
};

jsdom.env('./test/backend/coverage/index.html', (err, window) => {
  let rows = window.document.documentElement.getElementsByClassName('metric');
  for (let cnt = 0; cnt < rows.length; cnt++) 
    stats.push(rows[cnt].textContent);
  
  updateStats(metrics, stats);
  for (let i = 0; i < stats.length; i++) 
    rows[i].textContent = stats[i];
  
  $('metric').replaceWith(rows);
  window.document.documentElement
    .getElementsByTagName('tbody')[0].appendChild(table);
  fs.writeFile('./test/backend/coverage/index.html',
    window.document.documentElement.outerHTML, (error) => {
      if (error) throw error;
    });
  fs.rename('./test/backend/coverage/index.html',
    './coverage/index.html', (err) => {
      if (err) throw err;
    });
});

// Clean up code : 
fs.rename('./test/backend/coverage/prettify.css',
  './coverage/prettify.css', (err) => {
    if (err) throw err;
  });
fs.rename('./test/backend/coverage/prettify.js',
  './coverage/prettify.js', (err) => {
    if (err) throw err;
  });
fs.rename('./test/backend/coverage/base.css',
  './coverage/base.css', (err) => {
    if (err) throw err;
  });
fs.rename('./test/backend/coverage/sorter.js',
  './coverage/sorter.js', (err) => {
    if (err) throw err;
  });
// delete the already stored coverage reports
rmdir('./test/backend/coverage', (err) => {
  if (err) throw err;
});

rmdir('./test/frontend/coverage', (err) => {
  if (err) throw err;
});
