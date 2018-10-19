package org.cloudfoundry.abacus.demo;

import org.cloudfoundry.abacus.demo.model.*;
import org.cloudfoundry.abacus.demo.model.AggregatedUsage.WindowName;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.List;

@SpringBootApplication
public class DemoApplication implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(DemoApplication.class);

  @Value("${collector:http://localhost:9080}")
  private String collector;

  @Value("${reporting:http://localhost:9088}")
  private String reporting;

  public static void main(String... args) throws Exception {
    SpringApplication.run(DemoApplication.class, args);
  }

  @Override
  public void run(ApplicationArguments args) throws Exception {
    RestTemplate restTemplate = new RestTemplate();

    postUsage(restTemplate);

    Thread.sleep(2000);

    Report report = getReport(restTemplate);

    int calls = getMonthlyHeavyAPICalls(report);
    log.info("Monthly heavy API calls {}", calls);

    System.exit(0);
  }

  private void postUsage(RestTemplate restTemplate) {
    Measure[] measures = {
        new Measure("storage", 1073741824),
        new Measure("light_api_calls", 1000),
        new Measure("heavy_api_calls", 1000)
    };
    long timestamp = System.currentTimeMillis();

    for (int usageNumber = 1; usageNumber < 4; usageNumber++) {
      Usage usage = new Usage(timestamp + usageNumber, measures);
      String collectorURL = String.format("%s/v1/metering/collected/usage", collector);

      URI location = restTemplate.postForLocation(collectorURL, usage);

      log.info("{} sent to {}; usage GET location {}", usage, collectorURL, location);
    }
  }

  private Report getReport(RestTemplate restTemplate) {
    String reportURL = String.format(
        "%s/v1/metering/organizations/us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/aggregated/usage",
        reporting
    );

    Report abacusReport = restTemplate.getForObject(reportURL, Report.class);
    log.info("Abacus report {}", abacusReport);

    return abacusReport;
  }

  private int getMonthlyHeavyAPICalls(Report report) {
    Space space = report.getSpaceByID("aaeae239-f3f8-483c-9dd0-de5d41c38b6a");
    Resource resource = space.getResourceByID("object-storage");
    AggregatedUsage aggregatedUsage = resource.getAggregatedUsageByMetricID("heavy_api_calls");

    List<Window> monthlyWindow = aggregatedUsage.getWindow(WindowName.MONTH);
    Window currentMonth = monthlyWindow.get(0);
    return currentMonth.getSummary();
  }
}
