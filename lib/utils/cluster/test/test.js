'use strict';

// Convenient Node cluster setup, which monitors and restarts child processes
// as needed.

const events = require('events');
const proxyquire = require('proxyquire');

// Mock the cluster module
const clustmock = {
    // Track workers
    workers: [],

    // Mock an emitter for cluster events
    emitter: new events.EventEmitter(),
    on: (e, l) => clustmock.emitter.on(e, l),

    // Mock fork of a new worker
    fork: spy(() => {
        const worker = {
            process: { pid: 123 },
            on: spy(),
            send: spy(),
            disconnect: () => {
                clustmock.workers.splice(0, 1);
                clustmock.emitter.emit('disconnect', worker);
                clustmock.emitter.emit('exit', worker, 1);
            }
        };
        clustmock.workers.push(worker);
        return worker;
    })
};

// Mock the process.send function
process.send = spy();

// Mock the process event emitter
process.emitter = new events.EventEmitter();
process.on = (e, l) => { process.emitter.on(e, l); };

const cluster = proxyquire('..', { cluster: clustmock });

describe('cf-abacus-cluster', () => {
    let exit;
    let clock;
    beforeEach(() => {
        // Save process.exit function as tests mock it and setup fake timers
        exit = process.exit;
        clock = sinon.useFakeTimers(Date.now());
    });
    afterEach(() => {
        // Restore original process.exit function and original timers
        process.exit = exit;
        clock.restore();
    });

    it('sets up and monitors a Node cluster master', () => {
        const listen = spy();
        const onmsg = spy();
        process.exit = spy();

        // Simulate a cluster master process
        clustmock.isMaster = true;
        clustmock.isWorker = false;
        expect(cluster.isMaster()).to.equal(true);
        expect(cluster.isWorker()).to.equal(false);
        expect(cluster.wid()).to.equal(0);

        // Configure the cluster to use one cpu
        cluster.cpus([require('os').cpus()[0]]);

        // Register a message listener with the cluster
        cluster.on('message', onmsg);

        // Create a clustered server
        const server = cluster({ listen: listen });
        server.listen();

        // Run interval timers once
        clock.tick(31000);

        // Expect the server's listen function to not be called, and one
        // worker to be created
        expect(listen.args.length).to.equal(0);
        expect(clustmock.fork.args.length).to.equal(1);
        expect(clustmock.workers.length).to.equal(1);

        // Simulate a worker disconnect and exit
        const worker = clustmock.workers[0];
        clustmock.workers.splice(0, 1);
        clustmock.emitter.emit('disconnect', worker);
        clustmock.emitter.emit('exit', worker, 1);

        // Expect a new worker to be created to replace the old one
        expect(clustmock.fork.args.length).to.equal(2);
        expect(clustmock.workers.length).to.equal(1);

        // Simulate a worker heartbeat expiration
        clustmock.workers[0].heartbeat = 0;
        clock.tick(31000);

        // Expect a new worker to be created to replace the expired one
        expect(clustmock.fork.args.length).to.equal(3);
        expect(clustmock.workers.length).to.equal(1);

        // Send a message to the cluster
        cluster.onMessage({ x: 1 });

        // Expect workers to get the message
        expect(clustmock.workers[0].send.args).to.deep.equal([[{ master: process.pid, x: 1 }]]);

        // Simulate signals and process exit
        process.emitter.emit('SIGINT', {});
        process.emitter.emit('SIGTERM', {});
        process.emitter.emit('exit', 0);
        process.emitter.emit('exit', 1);

        expect(process.exit.args.length).to.not.equal(0);
    });

    it('monitors a Node cluster worker', () => {
        const listen = spy();
        const onmsg = spy();
        process.exit = spy();

        // Simulate a cluster worker process
        clustmock.isMaster = false;
        clustmock.isWorker = true;
        clustmock.worker = { id: 1 };
        expect(cluster.isWorker()).to.equal(true);
        expect(cluster.wid()).to.equal(1);

        // Configure the cluster to use one cpu
        cluster.cpus([require('os').cpus()[0]]);

        // Register a message listener with the cluster
        cluster.on('message', onmsg);

        // Create a clustered server
        const server = cluster({ listen: listen });
        server.listen();

        // Run interval timers once
        clock.tick(31000);

        // Expect the server listen function to be called
        expect(listen.args.length).to.equal(1);

        // Expect a heartbeat message to be sent to the master
        expect(process.send.args[0][0].heartbeat).to.not.equal(undefined);

        // Send a message to the cluster
        cluster.onMessage({ x: 1 });

        // Expect the message to be sent to the master
        expect(process.send.args[1]).to.deep.equal([{ x: 1 }]);

        // Simulate a message received by the process
        process.emitter.emit('message', { y: 2 });

        // Simulate a listening message
        process.emitter.emit('message', { server: { listening: true }, worker: { process: { pid: 123 }}});

        // Simulate an exiting message
        process.emitter.emit('message', { server: { exiting: true }, worker: { process: { pid: 123 }}});

        // Expect the cluster listener to receive these messages
        expect(onmsg.args[0]).to.deep.equal([{ y: 2 }]);
        expect(onmsg.args[1]).to.deep.equal([{ server: { listening: true }, worker: { process: { pid: 123 }}}]);
        expect(onmsg.args[2]).to.deep.equal([{ server: { exiting: true }, worker: { process: { pid: 123 }}}]);

        // Simulate a worker disconnect
        process.emitter.emit('disconnect', {});

        // Run interval timers once
        clock.tick(31000);

        // Expect the heartbeat reporter to have gone silent
        expect(process.send.args.length).to.equal(2);

        // Simulate signals and process exit
        process.emitter.emit('SIGINT', {});
        process.emitter.emit('SIGTERM', {});
        process.emitter.emit('exit', 0);
        process.emitter.emit('exit', 1);

        expect(process.exit.args.length).to.not.equal(0);
    });
});

