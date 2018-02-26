package com.metering.cf.demo.usage;

import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.metering.cf.demo.config.Configuration;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

public class AbacusUsage {

  // --------------------------------------------------------------------------------
  // Logger
  // --------------------------------------------------------------------------------

  private static final Logger logger = LoggerFactory.getLogger(AbacusUsage.class);

  // --------------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------------
  private static final Configuration config = Configuration.getInstance();
  private static final String EXAMPLE_RESOURCE_ID = config.getResourceId();
  private static final String EXAMPLE_RESOURCE_INSTANCE_ID = "test-instance";
  private static final String EXAMPLE_PLAN_ID = "standard";

  // --------------------------------------------------------------------------------
  // Methods / functions
  // --------------------------------------------------------------------------------

  public static AbacusUsageDocument createAbacusUsageDocumentExample(String appId, String spaceId, String orgId, List<AbacusUsageDocumentMeasuredUsage> measuredUsage) {
    AbacusUsageDocument usageDocument = new AbacusUsageDocument();
    usageDocument.setConsumerId(appId);
    usageDocument.setSpaceId(spaceId);
    usageDocument.setOrganizationId(orgId);
    usageDocument.setResourceId(EXAMPLE_RESOURCE_ID);
    usageDocument.setResourceInstanceId(EXAMPLE_RESOURCE_INSTANCE_ID);
    usageDocument.setPlanId(EXAMPLE_PLAN_ID);
    usageDocument.setStart(Instant.now().toEpochMilli());
    usageDocument.setEnd(usageDocument.getStart() + 10);
    usageDocument.setMeasuredUsage(measuredUsage);
    return usageDocument;
  }

  public static String getJsonStringFromObject(Object obj) {
    String result = null;
    try {
      result = (new ObjectMapper()).writeValueAsString(obj);
    } catch (JsonProcessingException e) {
      logger.warn("Exception while converting object to JSON string: " + e.getMessage(), e);
    }
    return result;
  }

}
