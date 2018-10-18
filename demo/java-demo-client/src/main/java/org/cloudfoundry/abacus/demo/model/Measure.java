package org.cloudfoundry.abacus.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.StringJoiner;

@JsonIgnoreProperties(ignoreUnknown = true)
public class Measure {

  @JsonProperty("measure")
  private String measure;

  @JsonProperty("quantity")
  private int quantity;

  public Measure(String measure, int quantity) {
    this.measure = measure;
    this.quantity = quantity;
  }

  public String getMeasure() {
    return measure;
  }

  public void setMeasure(String measure) {
    this.measure = measure;
  }

  public int getQuantity() {
    return quantity;
  }

  public void setQuantity(int quantity) {
    this.quantity = quantity;
  }

  @Override
  public String toString() {
    return new StringJoiner(", ", Measure.class.getSimpleName() + "[", "]")
        .add("measure='" + measure + "'")
        .add("quantity=" + quantity)
        .toString();
  }
}
