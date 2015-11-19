Monitoring Abacus applications using Hystrix Dashboard
===

Building Hystrix Dashboard
---

Get latest customized Hystrix Dashboard

```bash
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
git clone https://github.com/Netflix/Turbine
cd Turbine
git checkout 1.x
git pull
```

Configure Turbine to use Eureka based Abacus application registration details using config.properties file at ./turbine-web/src/main/webapp/WEB-INF/classes/config.properties

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

Build the turbine web application using Gradle

```bash
./gradlew build
```

The build creates Turbine web application at ./turbine-web/build/libs/turbine-web-1.0.0-SNAPSHOT.war

Note: If you are using Java 8 then your build may run into Java doc lint errors, see [Building Turbine 1.x branch using Java 8 results in Java doc lint errors](https://github.com/Netflix/Turbine/issues/103) for more details.

Building Eureka
---

This is an optional step and is required only if you are running more than one instance of an Abacus application and need to aggregate metrics data from all instances into one logical group.

Get Eureka source code

```bash
git clone https://github.com/Netflix/eureka
cd eureka
git pull
```
Build the eureka web application using Gradle

```bash
./gradlew build
```

The build creates Eureka web applications at ./eureka-server/build/libs/eureka-server-1.3.5-SNAPSHOT.war and ./eureka-server-karyon3/build/libs/eureka-server-karyon3-1.3.5-SNAPSHOT.war. You can use any one of them as your Eureka server.

Register Abacus with Eureka and aggregate application instances metrics using Turbine
---

### Local installation

* Run Turbine using Jetty

 ```bash
 cd <turbine-source-root>
 ./gradlew jettyRun
 ```
 Gradle build will hang with the URL needed to access the turbine: `Running at http://localhost:7980/turbine-web`

* Run Eureka using Jetty

 ```bash
 cd <eureka-source-root>
 ./gradlew jettyRun
 ```
 Gradle build will hang at 92% with the URL needed to access the eureka: `Running at http://localhost:8080/eureka`

* Run Abacus applications
 ```bash
 cd <abacus-source-root>
 # Set EUREKA environment variable to http://localhost:8080
 export EUREKA=http://localhost:8080
 npm start
 ```

Monitoring Abacus
---

### Local installation

Run the dashboard using Jetty

 ```bash
 cd <hystrix-source-root>/hystrix-dashboard
 ../gradlew jettyRun
 ```

Gradle build will hang at 75% with the URL needed to access the dashboard: `Running at http://localhost:7979/hystrix-dashboard`

Access the dashboard URL from the last step: `http://localhost:7979/hystrix-dashboard`

Add hystrix streams from Abacus applications:
* Enter hystrix or turbine stream URL for an application. For example, the usage collector application running at local machine would have hystrix stream reachable at `http://localhost:9080/hystrix.stream` and would have turbine stream reachable at `http://localhost:7980/turbine-web/turbine.stream?cluster=ABACUS-USAGE-COLLECTOR`
* Enter a title for an application
* Uncheck *Monitor Thread Pools*
* Click *Add Stream*
* Repeat the above steps for each application

Click *Monitor Streams* to monitor the applications

### Cloud Foundry installation

Push the Hystrix dashboard application using:
```bash
cf push hystrix-dashboard -p ./build/libs/hystrix-dashboard-*-SNAPSHOT.war
```

To use Jetty application server use the following command:
```bash
cf push hystrix-dashboard -p ./build/libs/hystrix-dashboard-*-SNAPSHOT.war -b git://github.com/jmcc0nn3ll/jetty-buildpack.git
```

Access the dashboard URL displayed in the end of the `cf push` command output

Add hystrix streams from Abacus applications:
* Enter hystrix steam URL for an application. For example, the usage collector application will have hystrix stream reachable at the URL of the application plus the `hystrix.stream` suffix:  `http://abacus-usage-collector.cfdomain.com/hystrix.stream`
* Enter a title for an application
* Uncheck *Monitor Thread Pools*
* Click *Add Stream*
* Repeat the above steps for each application

Click *Monitor Streams* to monitor the applications
