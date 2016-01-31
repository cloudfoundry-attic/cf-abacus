abacus-account-plugin
===

Minimal example implementation of an Abacus account management plugin.

An account is a collection of organizations managed by a single billing entity.

An account plugin provides REST APIs used by the Abacus usage processing
pipeline to retrieve information about the account owning an organization, and
the rating plans and pricing plans which should be used to rate resource usage
incurred by that organization.

This minimal Abacus account management plugin example is provided only for
demo and test purposes. An integrator of Abacus is expected to replace it with
a real production implementation.

