package org.cloudfoundry.abacus.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.StringJoiner;

@JsonIgnoreProperties(ignoreUnknown = true)
public class AggregatedUsage {

  public enum WindowName { SECONDS, MINUTES, HOURS, DAYS, MONTH }

  private String metric;

  private List<List<Window>> windows;

  public String getMetric() {
    return metric;
  }

  public void setMetric(String metric) {
    this.metric = metric;
  }

  public List<List<Window>> getWindows() {
    return windows;
  }

  public void setWindows(List<List<Window>> windows) {
    this.windows = windows;
  }

  public List<Window> getWindow(WindowName name) {
    return windows.get(name.ordinal());
  }

  @Override
  public String toString() {
    return new StringJoiner(", ", AggregatedUsage.class.getSimpleName() + "[", "]")
        .add("metric='" + metric + "'")
        .add("windows=" + windows)
        .toString();
  }
}
