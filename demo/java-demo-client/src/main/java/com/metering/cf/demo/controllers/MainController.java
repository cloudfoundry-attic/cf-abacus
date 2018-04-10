package com.metering.cf.demo.controllers;

import java.time.Instant;
import java.util.List;
import java.net.URL;

import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

import org.apache.cxf.jaxrs.client.WebClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.ResponseBody;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.metering.cf.demo.config.Configuration;
import com.metering.cf.demo.usage.AbacusUsage;
import com.metering.cf.demo.usage.AbacusUsageDocument;
import com.metering.cf.demo.usage.AbacusUsageDocumentMeasuredUsage;

@Controller
public class MainController {

  // --------------------------------------------------------------------------------
  // Logger and Config
  // --------------------------------------------------------------------------------

  private static final Logger logger = LoggerFactory.getLogger(MainController.class);
  private static final Configuration config = Configuration.getInstance();

  // --------------------------------------------------------------------------------
  // Controller Mappings
  // --------------------------------------------------------------------------------

  /**
   * GET: /
   * Accessing root returns the index page.
   * Notes:
   * - The index page is rendered using the Thymeleaf template engine.
   * - Used template is /src/main/resources/templates/index.html.
   * - Configuration object is passed to template and used there to extract values from and show it in the UI.
   */
  @RequestMapping(value = "/", method = RequestMethod.GET)
  public String index(Model model) {
    logger.debug("Index page requested.");
    model.addAttribute("config", config);
    return "index";
  }

  /**
   * POST: /sendusage
   * UI calls this to let backend create and send the usage document to Abacus.
   * <p>
   * Note: The UI should send an array of the measures that should be sent to Abacus in a format like this in the body:
   * <p>
   * [
   * {"measure":"api_calls", "quantity":100},
   * {"measure":"storage",         "quantity":11073741824}
   * ]
   * <p>
   * The controller will automatically convert this to a List<AbacusUsageDocumentMeasuredUsage>.
   * <p>
   * Result: Backend will send back JSON array with two elements:
   * - 1. element: Integer representing the return code that the backend received from Abacus.
   * - 2. element: The JSON object (Abacus usage report document) that has been sent to Abacus.
   */
  @RequestMapping(value = "/sendusage", method = RequestMethod.POST, produces = "application/json")
  @ResponseBody
  public JsonNode sendUsage(Model model, @RequestBody List<AbacusUsageDocumentMeasuredUsage> measuredUsageList) throws Exception {

    JsonNodeFactory jsonFactory = JsonNodeFactory.instance;
    ArrayNode result = jsonFactory.arrayNode();
    int responseCode = -1;
    JsonNode sentDocument = null;

    // Generate Abacus usage document to send
    AbacusUsageDocument abacusUsageDocument = AbacusUsage.createAbacusUsageDocumentExample(config.getAppId(), config.getSpaceId(), config.getOrgId(), measuredUsageList);
    String abacusUsageDocumentString = AbacusUsage.getJsonStringFromObject(abacusUsageDocument);
    logger.debug("Created JSON to send to Abacus: " + abacusUsageDocumentString);
    sentDocument = jsonFactory.pojoNode(abacusUsageDocument);

    // Send the generated document to Abacus
    WebClient webClient = WebClient.create(config.getAbacusUsageCollectorUrl()).accept(MediaType.APPLICATION_JSON_TYPE);
    webClient.header("Content-Type", "application/json");
    webClient.header("Authorization", config.getAbacusOperationToken());
    Response response = webClient.post(abacusUsageDocumentString);
    responseCode = response.getStatus();
    logger.debug("Response code received from Abacus: " + responseCode);

    // Assemble response to client
    // 1. Add response code
    result.add(jsonFactory.numberNode(responseCode));
    // 2. Add usage document sent to Abacus
    result.add(sentDocument);

    return result;
  }

  /**
   * GET: /getusage
   * UI calls this to let backend fetch and return the usage report for the organization from Abacus.
   * We will extract the monthly aggregates of the whole organization's consumption of "object-storage"
   * from the report provided by Abacus.
   * <p>
   * Result: Backend will send back JSON array with three elements:
   * - 1. element: Integer representing the return code that the backend received from Abacus.
   * - 2. element: JSON array containing metrics and aggregated (monthly) quantities that have been extracted from Abacus report.
   * - 3. element: JSON object representing the whole report received from Abacus.
   */
  @RequestMapping(value = "/getusage", method = RequestMethod.GET, produces = "application/json")
  @ResponseBody
  public JsonNode getUsageReport() throws Exception {

    JsonNodeFactory jsonFactory = JsonNodeFactory.instance;
    ArrayNode result = jsonFactory.arrayNode();
    JsonNode responseJson = jsonFactory.objectNode();
    int responseCode = -1;
    ArrayNode metricsQuantity = jsonFactory.arrayNode();

    try {
      // Get report on organization's usage from Abacus Reporting


      String requestUrlString = Configuration.ABACUS_REPORTING_URL + "/" + Configuration.getInstance().getOrgId();
      requestUrlString += "/aggregated/usage/" + Instant.now().toEpochMilli();
      logger.debug("Getting aggregated usage report for organization from Abacus. Using following URL: " + requestUrlString);

      // Fix if missing thrailing slash or added double slashes
      URL url = new URL(requestUrlString);

      WebClient webClient = WebClient.create(url.toString()).accept(MediaType.APPLICATION_JSON_TYPE);
      webClient.header("Authorization", config.getAbacusOperationToken());
      Response response = webClient.get();
      responseCode = response.getStatus();
      logger.debug("Response code received from Abacus: " + responseCode);

      String responseString = response.readEntity(String.class);
      responseJson = (new ObjectMapper()).readTree(responseString);
      if (responseJson.has("error")) {
        String errorMsg = responseJson.get("error").toString();
        if (responseJson.has("message"))
          errorMsg += " - " + responseJson.get("message").toString();
        if (errorMsg.length() < 1)
          errorMsg = responseString;
        logger.warn("Something went wrong getting report from Abacus: " + errorMsg);
      } else {
        boolean unexpected = true;
        if (responseJson.has("organization_id") && responseJson.has("resources")) {
          ArrayNode resources = (ArrayNode) responseJson.get("resources");
          for (JsonNode resource : resources) {
            if (resource.has("resource_id") && resource.get("resource_id").asText().equalsIgnoreCase(config.getResourceId()) && resource.has("plans")) {
              ArrayNode plans = (ArrayNode) resource.get("plans");
              for (JsonNode plan : plans) {
                ArrayNode aggregatedUsages = (ArrayNode) plan.get("aggregated_usage");
                for (JsonNode aggregatedUsage : aggregatedUsages) {
                  Double quantity = new Double(-1);
                  // Get metric
                  String metric = aggregatedUsage.has("metric") ? aggregatedUsage.get("metric").asText() : "unknown";
                  logger.debug("Metric: " + metric);
                  // Get aggregates
                  if (aggregatedUsage.has("windows")) {
                    ArrayNode windows = (ArrayNode) aggregatedUsage.get("windows");
                    // Every "windows" array has 5 elements. The 5th element stores monthly
                    // aggregates, and contains two objects. The first one contains the
                    // aggregates for the current month, and the second one for the previous month.
                    // We'll just extract the aggregated quantity for the current month.
                    if (windows.size() != 5)
                      logger.warn("Unexpected window size in Abacus reporting document. Expected 5, but was: " + windows.size());
                    ArrayNode windowContents = (ArrayNode) windows.get(4);
                    if (windowContents.size() != 2)
                      logger.warn("Unexpected window contents size in Abacus reporting document. Expected 2, but was: " + windowContents.size());
                    JsonNode aggregates = windowContents.get(0);
                    if (aggregates.has("quantity"))
                      quantity = aggregates.get("quantity").asDouble();
                    logger.debug("Quantity: " + quantity);
                    unexpected = false;
                  }
                  ObjectNode metricsQuantityObject = jsonFactory.objectNode();
                  metricsQuantityObject.put("metric", metric);
                  metricsQuantityObject.put("quantity", quantity);
                  metricsQuantity.add(metricsQuantityObject);
                }
              }
            }
          }
        }
        if (unexpected)
          logger.warn("Received unexpected response content when requesting report from Abacus: '" + responseString + "'");
      }
    } catch (Exception e) {
      logger.warn("Something went wrong getting report from Abacus reporting: " + e.getMessage(), e);
    }

    // Assemble response to client
    // 1. Add response code
    result.add(jsonFactory.numberNode(responseCode));
    // 2. Add array containing extracted metrics and aggregated quantities
    result.add(metricsQuantity);
    // 3. Add whole Abacus response
    result.add(responseJson);

    return result;

  }

}
