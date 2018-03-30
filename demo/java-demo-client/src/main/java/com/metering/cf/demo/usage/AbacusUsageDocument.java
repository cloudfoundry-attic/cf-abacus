package com.metering.cf.demo.usage;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"consumer_id", "space_id", "organization_id", "resource_id", "resource_instance_id", "plan_id",
    "start", "end", "measured_usage"})
public class AbacusUsageDocument {

  @JsonProperty("consumer_id")
  private String consumerId;
  @JsonProperty("space_id")
  private String spaceId;
  @JsonProperty("organization_id")
  private String organizationId;
  @JsonProperty("resource_id")
  private String resourceId;
  @JsonProperty("resource_instance_id")
  private String resourceInstanceId;
  @JsonProperty("plan_id")
  private String planId;
  @JsonProperty("start")
  private Long start;
  @JsonProperty("end")
  private Long end;
  @JsonProperty("measured_usage")
  private List<AbacusUsageDocumentMeasuredUsage> measuredUsage = null;
  @JsonIgnore
  private Map<String, Object> additionalProperties = new HashMap<String, Object>();

  @JsonProperty("consumer_id")
  public String getConsumerId() {
    return consumerId;
  }

  @JsonProperty("consumer_id")
  public void setConsumerId(String consumerId) {
    this.consumerId = consumerId;
  }

  @JsonProperty("space_id")
  public String getSpaceId() {
    return spaceId;
  }

  @JsonProperty("space_id")
  public void setSpaceId(String spaceId) {
    this.spaceId = spaceId;
  }

  @JsonProperty("organization_id")
  public String getOrganizationId() {
    return organizationId;
  }

  @JsonProperty("organization_id")
  public void setOrganizationId(String organizationId) {
    this.organizationId = organizationId;
  }

  @JsonProperty("resource_id")
  public String getResourceId() {
    return resourceId;
  }

  @JsonProperty("resource_id")
  public void setResourceId(String resourceId) {
    this.resourceId = resourceId;
  }

  @JsonProperty("resource_instance_id")
  public String getResourceInstanceId() {
    return resourceInstanceId;
  }

  @JsonProperty("resource_instance_id")
  public void setResourceInstanceId(String resourceInstanceId) {
    this.resourceInstanceId = resourceInstanceId;
  }

  @JsonProperty("plan_id")
  public String getPlanId() {
    return planId;
  }

  @JsonProperty("plan_id")
  public void setPlanId(String planId) {
    this.planId = planId;
  }

  @JsonProperty("start")
  public Long getStart() {
    return start;
  }

  @JsonProperty("start")
  public void setStart(Long start) {
    this.start = start;
  }

  @JsonProperty("end")
  public Long getEnd() {
    return end;
  }

  @JsonProperty("end")
  public void setEnd(Long end) {
    this.end = end;
  }

  @JsonProperty("measured_usage")
  public List<AbacusUsageDocumentMeasuredUsage> getMeasuredUsage() {
    return measuredUsage;
  }

  @JsonProperty("measured_usage")
  public void setMeasuredUsage(List<AbacusUsageDocumentMeasuredUsage> measuredUsage) {
    this.measuredUsage = measuredUsage;
  }

  @JsonAnyGetter
  public Map<String, Object> getAdditionalProperties() {
    return this.additionalProperties;
  }

  @JsonAnySetter
  public void setAdditionalProperty(String name, Object value) {
    this.additionalProperties.put(name, value);
  }

}
