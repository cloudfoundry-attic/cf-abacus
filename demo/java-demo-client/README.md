# Metering with Abacus - Simple Demo

This project is a simple demo of how to send usage data to Abacus (the metering solution of Cloud Foundry) to meter the usage of a service or application.

This README.md will explain what the demo is doing, how to build and run it, how to use its UI, some hints on implementations, as well as some basic information about Abacus and the most important terms related to the submission of usage data.

Notes:
* The simple demo here is intended for people that are interested in having a look at how usage data can be sent to Abacus using a Java application.
* If you are looking for a demo in JavaScript, please have a look at the [official Abacus JavaScript client demo](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/demo/client/src/test/test.js).
* If you simply want to get you usage via bash script you can check [this script](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/demo/scripts/abacus-get-usage.sh).


## Contents

* [Building, deploying, and configuring the demo](#building-deploying-and-configuring-the-demo)
  * [Prerequisites](#prerequisites)
  * [Building](#building)
  * [Configuration](#configuration)
  * [Deploying](#deploying)
* [Using the demo app](#using-the-demo-app)
  * [App details from CF runtime](#app-details-from-cf-runtime)
  * [Usage data to send](#usage-data-to-send)
  * [Monthly aggregates for organization](#monthly-aggregates-for-organization)
  * [Testing the abacus roundtrip](#testing-the-abacus-roundtrip)
* [REST API](#rest-api)
  * [/](#-root)
  * [/sendusage](#sendusage)
  * [/getusage](#getusage)
* [Additional information](#additional-information)
  * [Abacus pipeline, plan, measure, metrics](#abacus-pipeline-plan-measure-metrics)
  * [Submitting in demo application](#submitting-in-demo-application)


## Building, deploying, and configuring the demo
In this section we'll explain how to build, deploy and configure the demo. Additionally there is a section describing how to run the demo app on your local machine.

### Prerequisites
* a recent version of [Java 8 JDK](http://www.oracle.com/technetwork/java/javase/downloads/index.html)
* [Apache Maven](http://maven.apache.org/) installed and available on the path
* a recent version of [Cloud Foundry CLI](https://docs.cloudfoundry.org/cf-cli/install-go-cli.html) installed and available on the path


### Building
```bash
# Clone the demo app
git clone https://github.com/cloudfoundry-incubator/cf-abacus-broker.git

# Build the app
cd cf-abacus-broker/demo/java-demo-client/
mvn clean package
```

### Configuration
Replace the following variables in the `manifest.yml`:
```yaml
ORG_GUID: your-org-guid-here
REPORTING_URL: https://abacus-usage-reporting.<domain>/v1/metering/organizations
```

You can access your org guid by executing `cf org <name> --guid` or you can put a random guid-like string there.

By default the app sends:
  ```json
  [
    {"measure": "sampleName", "quantity": 250}
  ]
  ```

If you want to send different usage you can configure it from [`webapp/App.js`](https://github.com/cloudfoundry-incubator/cf-abacus-broker/blob/master/demo/java-demo-client/src/main/webapp/App.js#L12-L14).

### Deploying
At this point you will have to have configured the `manifest.yml`. You can deploy the app to a Cloud Foundry space of your choice with the following steps:
```sh
# Deploy demo app
cf push
# Create metering service
cf create-service metering standard mymetering
# Bind metering service to your demo app
cf bind-service metering-abacus-usage-example mymetering
```

Now open the service dashboard and define your own measures and metrics.

## Using the demo app
After opening the UI of the demo app in your browser, you will see three tables on the top of the screen. We will discuss each of them in a separate section in the following. In each section we describe the information shown in the table, what it is used for, where does it come from, and what actions can be triggered. After this walk through you are able to understand the information shown and the basic functionality of the demo app.


### App details from CF runtime

**Table: App Details from CF Runtime**

| Name               | Value                                |
| ------------------ | ------------------------------------:|
| CF Application ID  | a5579765-f471-4c2f-a300-e87afa32828b |
| CF Space ID        | 0e7eced3-ce39-433d-baa6-41cdf9743bcb |
| CF Organization ID | e014971b-0156-4680-afbc-1282b5f8ba9c |

The table shows IDs that the CF runtime environment issued to the demo app, the space the app runs into, and the organization this space belongs to. We need these IDs in the following to specify the source of the consumption we want to report to Abacus later on.

The app ID and the space ID are provided by the CF runtime environment in the `VCAP_APPLICATION` environment variable. The organization ID is provided as `User-Provided` variable (The one we put in the manifest).


### Usage data to send

**Table: Usage Data to send**

| Measure         | Quantity    |
| --------------- | -----------:|
| sampleName      |         250 |

The table holds the measures with according quantity that will be sent to Abacus as the reported usage, the next time a new usage document is created and sent. Feel free to change the quantity values to any positive integer values you like.

The names of the measures can't be changed.

When you click in the UI on the tile **"Create and send usage document to Abacus"**, then a usage document will be created that contains the measures with according quantities as defined in the table. As source of consumption the IDs shown in the table "App Details from CF Runtime" will be used. For submitting the usage document the collector URL, user, and password provided by the metering service bonded to the application are used.

The text area in the lower section of the UI shows the result of sending the usage document to Abacus. After a successful request, a return code of `201` should be shown, as well as the sent usage document.

An example for the whole output in the text areа would look like this:

```
Abacus return code: 201

Usage document sent to Abacus:
{
  "consumer_id": "a5579765-f471-4c2f-a300-e87afa32828b",
  "space_id": "0e7eced3-ce39-433d-baa6-41cdf9743bcb",
  "organization_id": "e014971b-0156-4680-afbc-1282b5f8ba9c",
  "resource_id": "object-storage",
  "resource_instance_id": "test-instance",
  "plan_id": "basic",
  "start": 1495554531200,
  "end": 1495554531210,
  "measured_usage": [
    {
      "measure": "sampleName",
      "quantity": 250
    }
  ]
}
```

### Monthly Aggregates for Organization

**Table: Monthly Aggregates for Organization**

| Metric           | Quantity |
| ---------------- | --------:|
| sampleName       |  unknown |


When we report new usage data for the resource given by the metering service, Abacus will update its stored aggregated usage data for that resource. One of the aggregates that Abacus updates is the monthly consumption of the resource by the organization we report in the usage document. We can query the current monthly usage using the tile **"Get Consumption Report from Abacus"** in the UI. After pressing this tile you can see the current monthly consumption reported by Abacus in the table (column "Quantity" will be updated from "unknown" to show the reported values).

To get the aggregates from Abacus, a "usage summary report" is requested via the Abacus API. Request API and structure of returned document are described [here](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/api.md#usage-summary-report). We use the same user we send usage with. And send the request to the `REPORTING_URL`, provided in the `manifest.yml`

After getting the results from Abacus, the text area in the lower section will show the raw results. After a successful request a return code of `200` should be shown, then the extracted aggregated values that are also shown in the table, followed by the raw document we received from Abacus.

Example:
```
Abacus return code: 200

Aggregated monthly usage for whole organization:
[
  {
    "metric": "sampleName",
    "quantity": 8.697
  }
]

Raw response from Abacus:
{
  "organization_id": "e014971b-0156-4680-afbc-1282b5f8ba9c",
  [... some big response here ... ]
}
```

Metrics are calculated based on the measures sent to Abacus. How this is done is defined by the used `plan`.

### Testing the Abacus roundtrip

To test the Abacus roundtrip, i.e. sending updates on the usage/consumption of your resource and then requesting the updated aggregates, do the following:
* Submit multiple usage documents by pressing the tile "Create and send usage document to Abacus" (you can modify the reported usage by adjusting the values in the table "Usage Data to send").
* After each time sending new usage reports to Abacus, also request the current usage aggregates from Abacus by pressing the tile "Get Consumption Report from Abacus". You should see how the aggregates increase each time after you submitted a new usage document.

If this "roundtrip" works, then your demo application is properly configured (e.g. users/passwords in environment variables), and Abacus connectivity and functionality work as expected.

After having played with the demo app for a while, it would be a good time to look at the source of the demo app to see how you could assemble your own usage documents in your own app and send these to Abacus.


## REST API
The demo application provides a minimalistic REST API that is used by the UI.

In the following, let's assume that `$BASE_URL` is the URL where the web app has been deployed to.

Now let's go through the REST endpoints and the functionality that is made available via those.


### / (root)
HTTP GET to this URL returns an HTML document with JavaScript that provides the UI5-based UI.

This endpoint is intended to be called with a browser to access the UI of the demo. The controller will fetch the HTML template contained in `src\main\resources\templates\index.html`, will pass the `com.metering.cf.demo.config.Configuration` singleton to the model, which is then used by the Thymeleaf template engine to insert some detected configuration details to JavaScript variables. The values passed to variables are the IDs of the app, the space, and the organization. The values of these variables are then used to build up the content shown in table "App Details from CF Runtime" of the UI.

REST implementation:
 - Controller: `com.metering.cf.demo.controllers.MainController`
 - Function: `String index(Model model)`

### /sendusage
Send submitted measures and quantities in a usage document to Abacus.

An HTTP POST to this URL with a JSON array holding measure and quantity tuple objects will instruct the backend to create a usage document that includes these values, to sent it to Abacus and return the HTML response code, as well as the sent usage document.

Example input:

	[
		{"measure":"sampleName", "quantity":250}
	]

Example result: See example already shown in section [Usage Data to send](#usage-data-to-send).

Note: The JSON document posted to the Controller is automatically converted to a `List<AbacusUsageDocumentMeasuredUsage>`. Together with the IDs of the app, space and organization from the `Configuration` singleton as parameters, `AbacusUsage.createAbacusUsageDocumentExample(...)` function is used to create the usage document as a `AbacusUsageDocument` object. This object is automatically converted to a JSON document via Jackson framework, sent to Abacus and together with the received result code returned to the caller.

REST implementation:
 - Controller: `com.metering.cf.demo.controllers.MainController`
 - Function: `JsonNode sendUsage(Model model, @RequestBody List<AbacusUsageDocumentMeasuredUsage> measuredUsageList)`


### /getusage

Get current monthly aggregated usage report for the organization the demo app is running in.

An HTTP GET to this URL will return a JSON array with three elements:
1. Element: Integer representing the return code that the backend received from Abacus (200 if successful).
2. Element: JSON array containing metrics and aggregated (monthly) quantities that have been extracted from Abacus report. (This data is used to update table "Monthly Aggregates for Organization" in UI.)
3. Element: JSON object representing the whole report received from Abacus.

Note: As the main purpose of the demo app is to show how to assemble and send an Abacus usage document, the part receiving and parsing the Abacus report has not been implemented as clean as the sending part. Instead of defining appropriate Jackson-annotated Java classes for dealing with documents and automatic conversion from and to JSON format, the report is "manually" parsed in the controller. Consider this more or less as a hack. Should you intend to implement a cleaner version of dealing with usage reports, consider e.g. the creation of Jackson-annotated classes to handle the documents (as in the sending case).

REST implementation:
 - Controller: `com.metering.cf.demo.controllers.MainController`
 - Function: `JsonNode getUsageReport()`


## Additional Information

### Abacus pipeline, plan, measure, metrics
Abacus is a Metering Service used to meter the usage of "resources" (e.g. services or applications) that run on Cloud Foundry. The provider of the resource is responsible for defining how usage is metered, accumulated, aggregated, and summarized via the service broker dashboard.

One part of the resource configuration is the definition of `plan`(s) for metering the resource. A plan is technically a JSON document that contains (amongst other things) a set of Javascript functions. The Abacus processing pipeline consists of a set of micro services, and each service in this [pipeline](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/resource-provider-guide.md#abacus-pipeline-concepts) will call a function defined in the plan to process the submitted usage data as it flows through the pipeline.

When a resource reports its usage to Abacus, a usage document describing the usage in terms of `measures` will be sent to Abacus (e.g. number of API calls executed, or bytes of storage used). This document will then be processed by the Abacus' meter, accumulator, aggregator, and reporting service by applying the functions defined in the resource configuration document in the following sequence:

- `meter()` function: It defines how the reported usage measures are converted into `metrics` relevant for the particular resource (e.g. convert from a measure of API calls to a metric of thousands of API calls, or convert from a measure of used bytes of storage to the metric of GB of used storage).
- `accumulate()` function: Defines how a particular metric needs to be accumulated over time, e.g. how to calculate the usage per second, minute, hour, day, or month. This is usually a simple sum (e.g. sum up usage metric of all days of a month to get the metric of monthly usage).
- `aggregate()` function: Defines how a particular metric needs to be aggregated at different levels under a Cloud Foundry organization (e.g. how to aggregate the consumption of a single Cloud Foundry space, or all the spaces within an organization).

Note: Other functions, like `rate()`, `summarize()` and `charge()` deal e.g. with calculating costs, final summarization of usage, and according cost charging. These are out of scope here.

For more details please refer to sections "[Pipeline Concepts](https://github.com/cloudfoundry-incubator/cf-abacus/wiki/Pipeline-Concepts)", "[Measures](https://github.com/cloudfoundry-incubator/cf-abacus/wiki/Measures)" and "[Metrics](https://github.com/cloudfoundry-incubator/cf-abacus/wiki/Metrics)".


### Submitting in demo application

The demo application allows you to define the measures to submit as usage to Abacus via the UI in table "[Usage Data to send](#usage-data-to-send)", and to trigger the actual submission via a click on an UI tile. When actually sending the usage data, a `resource usage document` describing the usage for our imaginary instance of the resource is created according to the measures defined in the plan. In the source of our demo application see function

	com.metering.cf.demo.usage.AbacusUsage.createAbacusUsageDocumentExample(String appId, String spaceId, String orgId, List<AbacusUsageDocumentMeasuredUsage> measuredUsage)

to understand how the demo actually creates the resource usage documents. As resource ID we set the id provided by the service plan under the field `resource_id`, and as plan ID the field `plan` (Usually `standard`). When specifying the consumer (i.e. the source / cause of the consumption / usage) we use the demo app's own ID, space ID, and organization ID for simplicity purposes.

After we created the usage document, we submit it to Abacus using its "Resource Usage Collenction API", documented [here](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/api.md#resource-usage). In the source of the demo app, see the following function to see how the submission can be done with a simple JAX-RS web client and a few lines of code:

	com.metering.cf.demo.controllers.MainController.sendUsage(...)

## Appendix

### Usage Summary Report

When pressing the tile "Get Consumption Report from Abacus" in the UI, a usage summary report will be requested from Abacus. The raw response from Abacus is part of the details shown in the text area in the lower part of the screen. We omitted the raw report returned by Abacus in previous sections due to its size.
