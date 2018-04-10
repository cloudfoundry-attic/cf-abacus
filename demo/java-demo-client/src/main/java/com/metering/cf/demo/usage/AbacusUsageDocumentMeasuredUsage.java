package com.metering.cf.demo.usage;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"measure", "quantity"})
public class AbacusUsageDocumentMeasuredUsage {

  @JsonProperty("measure")
  private String measure;
  @JsonProperty("quantity")
  private Long quantity;
  @JsonIgnore
  private Map<String, Object> additionalProperties = new HashMap<String, Object>();

  public AbacusUsageDocumentMeasuredUsage() {
  }

  public AbacusUsageDocumentMeasuredUsage(String measure, Long quantity) {
    this.setMeasure(measure);
    this.setQuantity(quantity);
  }

  @JsonProperty("measure")
  public String getMeasure() {
    return measure;
  }

  @JsonProperty("measure")
  public void setMeasure(String measure) {
    this.measure = measure;
  }

  @JsonProperty("quantity")
  public Long getQuantity() {
    return quantity;
  }

  @JsonProperty("quantity")
  public void setQuantity(Long quantity) {
    this.quantity = quantity;
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
