Monitoring Abacus applications using Hystrix Dashboard
===

Building Hystrix Dashboard
---

Get latest customized Hystrix Dashboard

```bash
cd ~/workspace
git clone https://github.com/sasrin/Hystrix
cd Hystrix
git checkout dev
git pull
```

Build the dashboard using Gradle

```bash
cd hystrix-dashboard
../gradlew build
```

The build creates Hystrix Dashboard web application at ./build/libs/hystrix-dashboard-X.X.X-SNAPSHOT.war

Building Turbine
---

This is an optional step and is required only if you are running more than one instance of an Abacus application and need to aggregate metrics data from all instances into one logical group.

Get Turbine source code

```bash
cd ~/workspace
git clone https://github.com/Netflix/Turbine
cd Turbine
git checkout 1.x
git pull
```

Configure Turbine to use Eureka based Abacus application registration details using config.properties file at `./turbine-web/src/main/webapp/WEB-INF/classes/config.properties`

* Change instance discovery implementation to EurekaInstanceDiscovery
* Add Abacus application names to list of turbine clusters
* Update turbine instance URL suffix to use Abacus application ports
* Add Abacus application names to list of turbine application configuration
* Update default eureka service URL with http://\<eureka-host\>/\<eureka-context-root\>/v2/

See [Sample CF-Abacus specific Turbine configuration properties](https://gist.github.com/sasrin/178f1802a60515bb34b8) for more details.

Edit ./turbine-web/build.gradle and configure Jetty to use a unique local port for running Turbine by setting httpPort value to 7980.

```
 jettyRun {
        httpPort = 7980
 }
```

Build the turbine web application using Gradle:

```bash
./gradlew build
```
**Note:** If you are using Java 8 then your build may run into Java doc lint errors, see [Building Turbine 1.x branch using Java 8 results in Java doc lint errors](https://github.com/Netflix/Turbine/issues/103) for more details.

The build creates Turbine web application at ./turbine-web/build/libs/turbine-web.war

Building Eureka
---

This is an optional step and is required only if you are running more than one instance of an Abacus application and need to aggregate metrics data from all instances into one logical group.

Get Eureka source code

```bash
cd ~/workspace
git clone https://github.com/Netflix/eureka
cd eureka
git pull
```
Build the eureka web application using Gradle

```bash
./gradlew build
```

The build creates Eureka web applications at ./eureka-server/build/libs/eureka-server-1.3.5-SNAPSHOT.war and ./eureka-server-karyon3/build/libs/eureka-server-karyon3-1.3.5-SNAPSHOT.war. You can use any one of them as your Eureka server.

Monitoring Abacus
---

### Local installation

#### Direct instance monitoring

Run the dashboard using Jetty
 ```bash
 cd ~/workspace/Hystrix/hystrix-dashboard
 ../gradlew jettyRun
 ```

Gradle build will hang at 75% with the URL needed to access the dashboard: `Running at http://localhost:7979/hystrix-dashboard`. Access the dashboard URL from the last step: `http://localhost:7979/hystrix-dashboard`

Add hystrix streams from Abacus applications:
* Enter hystrix or turbine stream URL for an application. For example, the usage collector application running at local machine would have hystrix stream reachable at `http://localhost:9080/hystrix.stream`
* Enter a title for an application
* Uncheck *Monitor Thread Pools*
* Click *Add Stream*
* Repeat the above steps for each application

Click *Monitor Streams* to monitor the applications

#### Aggregate application instances metrics

The previous approach becomes pretty cumbersome once Abacus is scaled and there are more than one instance of an application. To deal with this we can use Eureka and Turbine to aggregate the metrics.

* Run Turbine using Jetty

 ```bash
 cd ~/workspace/Turbine
 ./gradlew jettyRun
 ```
 Gradle build will hang with the URL needed to access the turbine: `Running at http://localhost:7980/turbine-web`

* Run Eureka using Jetty

 ```bash
 cd ~/workspace/eureka
 ./gradlew jettyRun
 ```
 Gradle build will hang at 92% with the URL needed to access the eureka: `Running at http://localhost:8080/eureka`

* Run Abacus applications
 ```bash
 cd ~/workspace/cf-abacus
 # Set EUREKA environment variable to http://localhost:8080
 export EUREKA=http://localhost:8080
 npm start
 ```

* Run the dashboard using Jetty
 ```bash
 cd ~/workspace/Hystrix/hystrix-dashboard
 ../gradlew jettyRun
 ```

 Gradle build will hang at 75% with the URL needed to access the dashboard: `Running at http://localhost:7979/hystrix-dashboard`. Access the dashboard URL from the last step: `http://localhost:7979/hystrix-dashboard`

* Add hystrix streams from Abacus applications:
   * Enter hystrix or turbine stream URL for an application. The turbine streams are reachable at `localhost:7980`. For example: `http://localhost:7980/turbine-web/turbine.stream?cluster=ABACUS-USAGE-COLLECTOR`
   * Enter a title for an application
   * Uncheck *Monitor Thread Pools*
   * Click *Add Stream*
   * Repeat the above steps for each application

   Click *Monitor Streams* to monitor the applications

### Cloud Foundry installation

The described monitoring method in BOSH-Lite requires an [all access security group](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/etc/secgroup.json) to enable direct app-to-app communication between Turbine and Abacus applications.

The all-access group should not be used in productive environments. An alternative solution is to use a special cell (placement pool) for Abacus applications or to deploy Abacus as infrastructure distributed system with the help of BOSH deployment.

* Change the `~/workspace/cf-abacus/lib/stubs/eureka/manifest.yml` to use the real Eureka server with the `/eureka` context path:
 ```yml
 applications:
 - name: abacus-eureka-stub
   host: abacus-eureka-stub
   path: ../../../../eureka/eureka-server/build/libs/eureka-server-1.3.5-SNAPSHOT.war
   buildpack: https://github.com/cloudfoundry/java-buildpack.git
   instances: 1
   memory: 512M
   disk_quota: 512M
   env:
     CONF: default
     DEBUG: e-abacus-*
     COUCHDB: abacus-dbserver
     NODE_MODULES_CACHE: false
     SECURED: false
     JBP_CONFIG_TOMCAT: "{tomcat: { context_path: eureka }}"
     # JWTKEY:
     # JWTALGO:
 ```

* Stage and start Abacus applications:
 ```bash
 cd ~/workspace/cf-abacus
 npm run cfstage
 npm run cfstart
 ```

* Check if Eureka knows about all Abacus applications:
 ```bash
 curl --compressed abacus-eureka-stub.bosh-lite.com/eureka/v2/apps
 ```
 The command should output a lot of data about Abacus instances like their IPs and ports.

* Edit `~/workspace/Turbine/turbine-web/src/main/webapp/WEB-INF/classes/config.properties`. The file should look like this:
 ```
 InstanceDiscovery.impl=com.netflix.turbine.discovery.EurekaInstanceDiscovery
 turbine.aggregator.clusterConfig=ABACUS-USAGE-COLLECTOR,ABACUS-USAGE-METER,ABACUS-USAGE-ACCUMULATOR,ABACUS-USAGE-AGGREGATOR,ABACUS-USAGE-RATE,ABACUS-USAGE-REPORTING,ABACUS-ACCOUNT-STUB,ABACUS-AUTHSERVER-STUB,ABACUS-PROVISIONING-STUB
 turbine.instanceUrlSuffix=:{port}/hystrix.stream
 turbine.ConfigPropertyBasedDiscovery.<cluster1>.instances=<instance1a>,<instance1b>
 turbine.ConfigPropertyBasedDiscovery.<cluster2>.instances=<instance2a>,<instance2b>
 turbine.appConfig=ABACUS-USAGE-COLLECTOR,ABACUS-USAGE-METER,ABACUS-USAGE-ACCUMULATOR,ABACUS-USAGE-AGGREGATOR,ABACUS-USAGE-RATE,ABACUS-USAGE-REPORTING,ABACUS-ACCOUNT-STUB,ABACUS-AUTHSERVER-STUB,ABACUS-PROVISIONING-STUB
 eureka.region=us-east-1
 eureka.serviceUrl.default=http://abacus-eureka-stub.bosh-lite.com/eureka/v2/
 turbine.ZookeeperInstanceDiscovery.zookeeper.quorum=127.0.0.1
 ```

* Push the monitoring applications to CF using:
 ```bash
 cf push turbine -p ~/workspace/Turbine/turbine-web/build/libs/turbine-web.war
 cf push hystrix-dashboard -p ~/workspace/Hystrix/hystrix-dashboard/build/libs/hystrix-dashboard-*-SNAPSHOT.war
 ```

 Note: If you want to use Jetty as application server, add the Jetty Buildpack: `-b git://github.com/jmcc0nn3ll/jetty-buildpack.git` to the `cf push` arguments.

* Access the dashboard URL displayed in the end of the last `cf push` command output and add hystrix streams from Abacus applications:
   * Enter hystrix steam URL for an application. For example, the usage collector application will have hystrix stream reachable at the URL of the turbine application plus the application name:  `http://turbine.bosh-lite.com/turbine.stream?cluster=ABACUS-USAGE-COLLECTOR`
   * Enter a title for an application
   * Uncheck *Monitor Thread Pools*
   * Click *Add Stream*
   * Repeat the above steps for each application

 Click *Monitor Streams* to monitor the applications
