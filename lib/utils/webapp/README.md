abacus-webapp
===

Setup Express with a process cluster and a selection of useful Express
middleware. Can be a convenient starting point for Webapps.

This module can be used pretty much as the original Express module, but the apps
it creates are configured with a good selection of Express middleware, for
logging, error management, body parsing, CORS support etc. They also run in a
resilient Node cluster, with one worker process per CPU core. The workers are
monitored and restarted as necessary after any failures.

