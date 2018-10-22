package org.cloudfoundry.abacus.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Arrays;
import java.util.StringJoiner;

@JsonIgnoreProperties(ignoreUnknown = true)
public class Usage {

  @JsonProperty("start")
  private long start;

  @JsonProperty("end")
  private long end;

  @JsonProperty("organization_id")
  private String organizationID = "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27";

  @JsonProperty("space_id")
  private String spaceID = "aaeae239-f3f8-483c-9dd0-de5d41c38b6a";

  @JsonProperty("consumer_id")
  private String consumerID = "app:bbeae239-f3f8-483c-9dd0-de6781c38bab";

  @JsonProperty("resource_id")
  private String resourceID = "object-storage";

  @JsonProperty("plan_id")
  private String planID = "basic";

  @JsonProperty("resource_instance_id")
  private String resourceInstanceID = "0b39fa70-a65f-4183-bae8-385633ca5c87";

  @JsonProperty("measured_usage")
  private Measure[] measures;

  public Usage(long timestamp, Measure[] measures) {
    this.start = timestamp;
    this.end = timestamp;
    this.measures = measures;
  }

  public long getStart() {
    return start;
  }

  public void setStart(long start) {
    this.start = start;
  }

  public long getEnd() {
    return end;
  }

  public void setEnd(long end) {
    this.end = end;
  }

  public String getOrganizationID() {
    return organizationID;
  }

  public void setOrganizationID(String organizationID) {
    this.organizationID = organizationID;
  }

  public String getSpaceID() {
    return spaceID;
  }

  public void setSpaceID(String spaceID) {
    this.spaceID = spaceID;
  }

  public String getConsumerID() {
    return consumerID;
  }

  public void setConsumerID(String consumerID) {
    this.consumerID = consumerID;
  }

  public String getResourceID() {
    return resourceID;
  }

  public void setResourceID(String resourceID) {
    this.resourceID = resourceID;
  }

  public String getPlanID() {
    return planID;
  }

  public void setPlanID(String planID) {
    this.planID = planID;
  }

  public String getResourceInstanceID() {
    return resourceInstanceID;
  }

  public void setResourceInstanceID(String resourceInstanceID) {
    this.resourceInstanceID = resourceInstanceID;
  }

  public Measure[] getMeasures() {
    return measures;
  }

  public void setMeasures(Measure[] measures) {
    this.measures = measures;
  }

  @Override
  public String toString() {
    return new StringJoiner(", ", Usage.class.getSimpleName() + "[", "]")
        .add("start=" + start)
        .add("end=" + end)
        .add("organizationID='" + organizationID + "'")
        .add("spaceID='" + spaceID + "'")
        .add("consumerID='" + consumerID + "'")
        .add("resourceID='" + resourceID + "'")
        .add("planID='" + planID + "'")
        .add("resourceInstanceID='" + resourceInstanceID + "'")
        .add("measures=" + Arrays.toString(measures))
        .toString();
  }
}
