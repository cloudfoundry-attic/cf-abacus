package org.cloudfoundry.abacus.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.StringJoiner;

@JsonIgnoreProperties(ignoreUnknown = true)
public class Window {

  @JsonProperty("quantity")
  private int quantity;

  @JsonProperty("summary")
  private int summary;

  public int getQuantity() {
    return quantity;
  }

  public void setQuantity(int quantity) {
    this.quantity = quantity;
  }

  public int getSummary() {
    return summary;
  }

  public void setSummary(int summary) {
    this.summary = summary;
  }

  @Override
  public String toString() {
    return new StringJoiner(", ", Window.class.getSimpleName() + "[", "]")
        .add("quantity=" + quantity)
        .add("summary=" + summary)
        .toString();
  }
}
