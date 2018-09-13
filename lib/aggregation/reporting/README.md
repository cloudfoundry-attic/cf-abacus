abacus-usage-reporting
===

Usage reporting service.

# Organization report

The report has the following structure:

* organization
   * resources
      * plans
   * spaces
      * resources
         * plans
      * consumers
         * resources
            * plans

Therefore the number of leaves can be represented as:
org_leaves = #resources * #plans + #spaces * (#resources * #plans + #space_consumers * #consumer_resources * #consumer_plans)

For example for:
* 324 resources
* 2 plans
* 99 spaces, each with
   * 20 consumers
   * 3 resources
   * 2 plans

We will have 324 * 2 + 99 * ( 324 * 2 + 20 * 3 * 2 ) = 648 + 99 * ( 648 + 120) = 648 + 99 * 768 = 648 + 76032 = 76680
