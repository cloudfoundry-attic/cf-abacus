'use strict';

// Convenient Node cluster setup, which monitors and restarts child processes
// as needed. Creates workers, monitors them, restarts them as needed, and
// manages the flow of event messages between the cluster master and the
// workers.

// We use process.exit() intentionally here
/* eslint no-process-exit: 1 */

const _ = require('underscore');
const cluster = require('cluster');
const events = require('abacus-events');
const vcapenv = require('abacus-vcapenv');

const map = _.map;
const clone = _.clone;
const range = _.range;

// Setup debug log
const debuglog = require('abacus-debug');
const debug = debuglog('abacus-cluster');
const edebug = debuglog('e-abacus-cluster');
const xdebug = debuglog('x-abacus-cluster');

// Set up an event emitter allowing a cluster to listen to messages from other
// modules and propagate them to the entire cluster
const emitter = events.emitter('abacus-cluster/emitter');
const on = (e, l) => {
  emitter.on(e, l);
};

// We're monitoring the health of cluster workers by requiring them to send
// heartbeat messages and monitoring these heartbeats in the cluster master.
// We terminate a worker if it stops sending heartbeats, resulting in a new
// worker getting forked to replace it. The following two times (in ms)
// are used to configure the expected worker heart rate and our monitoring
// interval.
const heartbeatInterval = parseInt(process.env.CLUSTER_HEARTBEAT) || 30000;
const heartMonitorInterval = heartbeatInterval * 2;

// Return true if we're in a cluster master process
const isMaster = () => cluster.isMaster;

// Return true if we're in a cluster worker process
const isWorker = () => cluster.noCluster || cluster.isWorker;

// Return the current worker id
const wid = () => cluster.worker ? cluster.worker.id : 0;

// Configure the number of workers to use in the cluster
// Warning: workers is a mutable variable
let workers = parseInt(process.env.CLUSTER_WORKERS) || 1;
const scale = (w) => {
  // Broadcast workers event to all instances of this module
  workers = w || parseInt(process.env.CLUSTER_WORKERS) || 1;
  debug('Requesting cluster update to %d workers', workers);
  emitter.emit('workers', workers);
  return workers;
};

// Return the number of workers in the cluster
const size = () => {
  return workers;
};

// Configure the cluster to run a single worker
const singleton = () => scale(1);

// Handle event requesting configuration of the number of workers to use
emitter.on('workers', (w) => {
  // Warning: mutating variable workers
  debug('Updating cluster to %d workers', w);
  workers = w;
});

// Monitor a worker process and emit its messages to the emitter listeners
const monitor = (worker) => {
  // Give the worker an initial heartbeat, as we don't want to erroneously
  // terminate it just after we've forked it if we hit our heart monitoring
  // cutoff before that worker gets a chance to report its heartbeat
  worker.heartbeat = Date.now();

  worker.on('message', (m) => {
    const msg = clone(m);
    // Record a worker heartbeat message in the worker, we're monitoring
    // these messages in our worker heart monitor function
    // Warning: mutating variable worker, but that's the simplest thing to
    // do here
    if(msg.heartbeat)
      worker.heartbeat = msg.heartbeat;

    // Store worker information in the message so any listener that's interested
    // can determine which worker the message is coming from
    msg.worker = {
      id: worker.id,
      process: {
        pid: worker.process.pid
      }
    };
    xdebug('Cluster master got message from worker %o', msg);
    emitter.emit('message', msg);
  });
};

// Fork a number of workers, configurable with a default of 1
const fork = () => {
  debug('Forking %d cluster workers', workers);
  map(range(workers), () => monitor(cluster.fork()));
};

// Handle process signals
const signals = (t, cleanupcb) => {
  process.on('SIGINT', () => {
    edebug('Cluster %s interrupted', t);
    debug('Cluster %s interrupted', t);
    cleanupcb(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    debug('Cluster %s terminated', t);
    cleanupcb(() => process.exit(0));
    process.exit(0);
  });
  if(process.env.HEAPDUMP) {
    // Trigger heapdumps
    process.on('SIGWINCH', () => {
      if(global.gc) {
        debug('%s gc\'ing');
        global.gc();
      }
    });

    // Save heapdumps
    require('heapdump');
  }
  process.on('exit', (code) => {
    if(code !== 0) {
      edebug('Cluster %s exiting with code %d', t, code);
      debug('Cluster %s exiting with code %d', t, code);
    }
    else
      debug('Cluster %s exiting', t);
    emitter.emit('log', {
      category: 'cluster',
      event: 'exiting',
      type: t,
      pid: process.pid,
      code: code
    });
  });
};

// A simple worker heart monitor, which regularly checks if workers have
// reported a heartbeat and terminates them if they haven't
const heartMonitor = () => {
  const cutoff = Date.now() - heartMonitorInterval;
  map(cluster.workers, (worker) => {
    // Disconnect worker if it failed to report a heartbeat within the
    // last monitoring interval
    if(worker.heartbeat < cutoff) {
      edebug('Cluster worker %d didn\'t report heartbeat, disconnecting it',
        worker.process.pid);
      debug('Cluster worker %d didn\'t report heartbeat, disconnecting it',
        worker.process.pid);
      worker.disconnect();
    }
  });
};

// Setup a Node cluster master process
const master = () => {
  debug('Cluster master started');
  emitter.emit('log', {
    category: 'cluster',
    event: 'started',
    type: 'master',
    pid: process.pid
  });

  // Monitor the heartbeats of our workers at regular intervals
  const i = setInterval(heartMonitor, heartMonitorInterval);
  if(i.unref) i.unref();

  // Set the master process title
  process.title = 'node ' +
    (process.env.TITLE || [vcapenv.appname(), vcapenv.appindex()].join('-')) +
    ' master';

  // Handle process signals
  signals('master', (exitcb) => {
    // Terminate the workers

    // Let the master process exit
    exitcb();
  });

  // Restart worker on disconnect unless it's marked with a noretry flag
  cluster.on('disconnect', (worker) => {
    edebug('Cluster worker %d disconnected', worker.process.pid);
    debug('Cluster worker %d disconnected', worker.process.pid);
    if(!worker.noretry) {
      edebug('Restarting cluster worker');
      monitor(cluster.fork());
    }
  });

  cluster.on('exit', (worker, code, signal) => {
    edebug('Cluster worker %d exited with code %d', worker.process.pid, code);
    debug('Cluster worker %d exited with code %d', worker.process.pid, code);
  });

  // Handle messages from worker servers
  emitter.on('message', (msg) => {
    if(msg.server) {
      if(msg.server.noretry) {
        debug('Cluster worker %d reported fatal error',
          msg.worker.process.pid);
        edebug('Cluster worker %d reported fatal error',
          msg.worker.process.pid);

        // Mark worker with a noretry flag if it requested it, typically to
        // avoid infinite retries when the worker has determined that retrying
        // would fail again anyway
        // Warning: mutating worker variable here
        cluster.workers[msg.worker.id].noretry = true;
      }

      if(msg.server.listening)
        debug('Cluster worker %d listening on %d',
          msg.worker.process.pid, msg.server.listening);

      if(msg.server.exiting)
        debug('Cluster worker %d exiting', msg.worker.process.pid);
    }
  });
};

// Setup a Node cluster worker process
const worker = () => {
  debug('Cluster worker started');
  emitter.emit('log', {
    category: 'cluster',
    event: 'started',
    type: 'worker',
    pid: process.pid
  });

  // Set the worker process title
  process.title = 'node ' +
    (process.env.TITLE || [vcapenv.appname(), vcapenv.appindex()].join('-')) +
    ' worker';

  // Handle process signals
  signals('worker', (exitcb) => {
    // Let the process exit
    exitcb();
  });

  // Send a heartbeat message to the master at regular intervals
  // If the worker fails to send a heartbeat, well, we know it's not going
  // well and the master will terminate it
  const heartbeatReporter = setInterval(() => {
    process.send({
      heartbeat: Date.now()
    });
  }, heartbeatInterval);

  // Shutdown the heartbeat reporter when the worker is getting disconnected
  process.on('disconnect', () => {
    clearInterval(heartbeatReporter);
  });

  // Emit messages from the master to the emitter listeners
  process.on('message', (msg) => {
    emitter.emit('message', msg);
  });
};

// Configure a server for clustering
const clusterify = (server) => {
  // Optionally disable clustering to help debugging and profiling
  if(process.env.CLUSTER === 'false') {
    cluster.noCluster = true;

    // Handle process signals
    signals('worker', (exitcb) => {
      // Let the process exit
      exitcb();
    });

    return server;
  }

  if(cluster.isMaster) {
    // Setup the master process
    master();

    // Monkey patch the listen function, as in the master we want to fork
    // worker processes instead of actually listening
    if(server.listen)
      server.listen = fork;

  }
  // Setup a worker process
  else worker();

  return server;
};

// Process messages from other modules
const onMessage = (msg) => {
  xdebug('Got message in onMessage %o', msg);
  if(cluster.isWorker) {

    // In a worker process, send message to the master
    xdebug('Cluster worker sending message to master %o', msg);
    process.send(msg);

  }
  else {

    // In the master process, send message to all the workers
    const mmsg = clone(msg);
    mmsg.master = process.pid;
    map(cluster.workers, (worker) => {
      xdebug('Cluster master sending message to worker %d %o', worker.process
        .pid, mmsg);
      worker.send(mmsg);
    });
  }
};

// Stitch the debug and cluster emitters and listeners together to make debug
// config messages flow from workers to master and back to workers and
// broadcast the log config across the cluster

// Let the debug module send messages to the cluster master
debuglog.on('message', onMessage);

// Pass cluster messages to the debug module
emitter.on('message', debuglog.onMessage);

// Export our public functions
module.exports = clusterify;
module.exports.onMessage = onMessage;
module.exports.on = on;
module.exports.isWorker = isWorker;
module.exports.isMaster = isMaster;
module.exports.scale = scale;
module.exports.singleton = singleton;
module.exports.size = size;
module.exports.wid = wid;

