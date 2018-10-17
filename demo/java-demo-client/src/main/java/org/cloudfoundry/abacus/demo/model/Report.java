package org.cloudfoundry.abacus.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Arrays;
import java.util.Optional;
import java.util.StringJoiner;

@JsonIgnoreProperties(ignoreUnknown = true)
public class Report {

  @JsonProperty("organization_id")
  private String organizationID;

  private Resource resources[];
  
  private Space spaces[];

  @JsonProperty("account_id")
  private String accountID;
  
  private long start;
  
  private long end;
  
  private long processed;
  
  private String id;

  @JsonProperty("processed_id")
  private String processedID;

  public String getOrganizationID() {
    return organizationID;
  }

  public void setOrganizationID(String organizationID) {
    this.organizationID = organizationID;
  }

  public Resource[] getResources() {
    return resources;
  }

  public void setResources(Resource[] resources) {
    this.resources = resources;
  }

  public Space[] getSpaces() {
    return spaces;
  }

  public void setSpaces(Space[] spaces) {
    this.spaces = spaces;
  }

  public String getAccountID() {
    return accountID;
  }

  public void setAccountID(String accountID) {
    this.accountID = accountID;
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

  public long getProcessed() {
    return processed;
  }

  public void setProcessed(long processed) {
    this.processed = processed;
  }

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getProcessedID() {
    return processedID;
  }

  public void setProcessedID(String processedID) {
    this.processedID = processedID;
  }

  public Space getSpaceByID(String id) {
    Optional<Space> found = Arrays.stream(spaces)
        .filter(space -> space.getSpaceID().equals(id))
        .findFirst();
    return found.orElse(null);
  }

  public Resource getResourceByID(String id) {
    Optional<Resource> found = Arrays.stream(resources)
        .filter(resource -> resource.getResourceID().equals(id))
        .findFirst();
    return found.orElse(null);
  }

  @Override
  public String toString() {
    return new StringJoiner(", ", Report.class.getSimpleName() + "[", "]")
        .add("organizationID='" + organizationID + "'")
        .add("resources=" + Arrays.toString(resources))
        .add("spaces=" + Arrays.toString(spaces))
        .add("accountID='" + accountID + "'")
        .add("start=" + start)
        .add("end=" + end)
        .add("processed=" + processed)
        .add("id='" + id + "'")
        .add("processedID='" + processedID + "'")
        .toString();
  }
}