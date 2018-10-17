package org.cloudfoundry.abacus.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Arrays;
import java.util.Optional;
import java.util.StringJoiner;

@JsonIgnoreProperties(ignoreUnknown = true)
public class Resource {

  @JsonProperty("resource_id")
  private String resourceID;

  private Plan plans[];

  @JsonProperty("aggregated_usage")
  private AggregatedUsage aggregatedUsage[];

  public String getResourceID() {
    return resourceID;
  }

  public void setResourceID(String resourceID) {
    this.resourceID = resourceID;
  }

  public Plan[] getPlans() {
    return plans;
  }

  public void setPlans(Plan[] plans) {
    this.plans = plans;
  }

  public AggregatedUsage[] getAggregatedUsage() {
    return aggregatedUsage;
  }

  public void setAggregatedUsage(AggregatedUsage[] aggregatedUsage) {
    this.aggregatedUsage = aggregatedUsage;
  }

  public AggregatedUsage getAggregatedUsageByMetricID(String metricID) {
    Optional<AggregatedUsage> found = Arrays.stream(aggregatedUsage)
        .filter(usage -> usage.getMetric().equals(metricID))
        .findFirst();
    return found.orElse(null);
  }

  @Override
  public String toString() {
    return new StringJoiner(", ", Resource.class.getSimpleName() + "[", "]")
        .add("resourceID='" + resourceID + "'")
        .add("plans=" + Arrays.toString(plans))
        .add("aggregatedUsage=" + Arrays.toString(aggregatedUsage))
        .toString();
  }
}
