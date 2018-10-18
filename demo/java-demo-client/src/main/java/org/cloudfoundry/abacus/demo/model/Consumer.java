package org.cloudfoundry.abacus.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Arrays;
import java.util.StringJoiner;

@JsonIgnoreProperties(ignoreUnknown = true)
public class Consumer {

  @JsonProperty("consumer_id")
  private String consumerId;

  @JsonProperty("resources")
  private Resource resources[];

  public String getConsumerId() {
    return consumerId;
  }

  public void setConsumerId(String consumerId) {
    this.consumerId = consumerId;
  }

  public Resource[] getResources() {
    return resources;
  }

  public void setResources(Resource[] resources) {
    this.resources = resources;
  }

  @Override
  public String toString() {
    return new StringJoiner(", ", Consumer.class.getSimpleName() + "[", "]")
        .add("consumerId='" + consumerId + "'")
        .add("resources=" + Arrays.toString(resources))
        .toString();
  }
}
