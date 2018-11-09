java-demo-client
===

Demo client that simulates the submission of usage by a service provider then
gets a report for the usage aggregated within a demo organization.

To start the demo with Java 11 or newer:
```sh
# Start Rabbit and Mongo
cd cf-abacus
docker-compose up

# In a new terminal start Abacus
cd cf-abacus
yarn start

# Start demo
./gradlew bootRun
```
