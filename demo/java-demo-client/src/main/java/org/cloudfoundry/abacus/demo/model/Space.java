package org.cloudfoundry.abacus.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Arrays;
import java.util.Optional;
import java.util.StringJoiner;

@JsonIgnoreProperties(ignoreUnknown = true)
public class Space {

  @JsonProperty("space_id")
  private String spaceID;

  private Resource resources[];

  private Consumer consumers[];

  public String getSpaceID() {
    return spaceID;
  }

  public void setSpaceID(String spaceID) {
    this.spaceID = spaceID;
  }

  public Resource[] getResources() {
    return resources;
  }

  public void setResources(Resource[] resources) {
    this.resources = resources;
  }

  public Consumer[] getConsumers() {
    return consumers;
  }

  public void setConsumers(Consumer[] consumers) {
    this.consumers = consumers;
  }

  public Resource getResourceByID(String id) {
    Optional<Resource> found = Arrays.stream(resources)
        .filter(resource -> resource.getResourceID().equals(id))
        .findFirst();
    return found.orElse(null);
  }

  public Consumer getConsumerByID(String id) {
    Optional<Consumer> found = Arrays.stream(consumers)
        .filter(consumer -> consumer.getConsumerId().equals(id))
        .findFirst();
    return found.orElse(null);
  }

  @Override
  public String toString() {
    return new StringJoiner(", ", Space.class.getSimpleName() + "[", "]")
        .add("spaceID='" + spaceID + "'")
        .add("resources=" + Arrays.toString(resources))
        .add("consumers=" + Arrays.toString(consumers))
        .toString();
  }
}
