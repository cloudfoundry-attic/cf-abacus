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

Monitoring Abacus
---

### Local installation

Run the dashboard using Jetty

```bash
../gradlew jettyRun
```

Gradle build will hang at 75% with the URL needed to access the dashboard: `Running at http://localhost:7979/hystrix-dashboard`

Access the dashboard URL from the last step: `http://localhost:7979/hystrix-dashboard`

Add hystrix streams from Abacus applications:
* Enter hystrix steam URL for an application. For example, the usage collector application running at local machine would have hystrix stream reachable at `http://localhost:9080/hystrix.stream`
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
