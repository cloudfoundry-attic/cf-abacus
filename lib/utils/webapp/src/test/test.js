'use strict';

// Setup of Express in a Node cluster, a convenient starting point for Webapps.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster);

const webapp = require('..');

describe('abacus-webapp', () => {
    it('handles HTTP requests', () => {
        // Create a test Webapp
        const app = webapp();

        // Add a test routes
        app.get('/ok/request', (req, res) => {
            // Return an OK response with a body
            res.send('okay');
        });

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Send an HTTP request, expecting an OK response
        request.get('http://localhost::p/:v/:r', { p: server.address().port, v: 'ok', r: 'request' }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.equal('okay');
        });
    });

    it('provides a basic Webapp setup with less middleware', () => {
        // Create a test Webapp
        const app = webapp.basic();

        // Add a test routes
        app.get('/ok/request', (req, res) => {
            // Return an OK response with a body
            res.send('okay');
        });

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Send an HTTP request, expecting an OK response
        request.get('http://localhost::p/:v/:r', { p: server.address().port, v: 'ok', r: 'request' }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.equal('okay');
        });
    });
});

