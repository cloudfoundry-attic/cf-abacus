package org.cloudfoundry.abacus.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Arrays;
import java.util.StringJoiner;

@JsonIgnoreProperties(ignoreUnknown = true)
public class Plan {

  @JsonProperty("plan_id")
  private String planID;

  @JsonProperty("aggregated_usage")
  private AggregatedUsage aggregatedUsage[];

  @JsonProperty("metering_plan_id")
  private String meteringPlanID;

  @JsonProperty("rating_plan_id")
  private String ratingPlanID;

  @JsonProperty("pricing_plan_id")
  private String pricingPlanID;

  public String getPlanID() {
    return planID;
  }

  public void setPlanID(String planID) {
    this.planID = planID;
  }

  public AggregatedUsage[] getAggregatedUsage() {
    return aggregatedUsage;
  }

  public void setAggregatedUsage(AggregatedUsage[] aggregatedUsage) {
    this.aggregatedUsage = aggregatedUsage;
  }

  public String getMeteringPlanID() {
    return meteringPlanID;
  }

  public void setMeteringPlanID(String meteringPlanID) {
    this.meteringPlanID = meteringPlanID;
  }

  public String getRatingPlanID() {
    return ratingPlanID;
  }

  public void setRatingPlanID(String ratingPlanID) {
    this.ratingPlanID = ratingPlanID;
  }

  public String getPricingPlanID() {
    return pricingPlanID;
  }

  public void setPricingPlanID(String pricingPlanID) {
    this.pricingPlanID = pricingPlanID;
  }

  @Override
  public String toString() {
    return new StringJoiner(", ", Plan.class.getSimpleName() + "[", "]")
        .add("planID='" + planID + "'")
        .add("aggregatedUsage=" + Arrays.toString(aggregatedUsage))
        .add("meteringPlanID='" + meteringPlanID + "'")
        .add("ratingPlanID='" + ratingPlanID + "'")
        .add("pricingPlanID='" + pricingPlanID + "'")
        .toString();
  }
}