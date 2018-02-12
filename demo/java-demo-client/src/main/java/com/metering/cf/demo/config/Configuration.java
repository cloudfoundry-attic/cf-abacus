package com.metering.cf.demo.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.metering.cf.demo.util.NetworkHelper;
import com.metering.cf.demo.util.OAuthToken;

public class Configuration {

  // --------------------------------------------------------------------------------
  // Logger
  // --------------------------------------------------------------------------------

  private static final Logger logger = LoggerFactory.getLogger(Configuration.class);

  // --------------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------------

  // Constants defining names of environment variables to read config data from
  public static final String ENV_VAR_NAME_CF_APP_INFO = "VCAP_APPLICATION";
  public static final String ENV_VAR_NAME_CF_SERVICES_INFO = "VCAP_SERVICES";
  public static final String ENV_VAR_NAME_ORG_GUID = "ORG_GUID";
  public static final String ENV_VAR_NAME_COLLECTOR_URL = "COLLECTOR_URL";
  public static final String ENV_VAR_NAME_REPORTING_URL = "REPORTING_URL";

  // Abacus endpoint URLs to call
  public static final String ABACUS_REPORTING_URL = System.getenv(ENV_VAR_NAME_REPORTING_URL);

  // --------------------------------------------------------------------------------
  // Class attributes
  // --------------------------------------------------------------------------------

  protected String cfApiUrl = null;
  protected String cfTokenUrl = null;
  protected String appId = null;
  protected String spaceId = null;
  protected String orgId = null;
  protected String abacusOperationUser = null;
  protected String abacusOperationPassword = null;
  protected OAuthToken abacusOperationToken = null;
  protected String resourceId = null;
  protected String abacusUsageCollectorUrl = null;

  // --------------------------------------------------------------------------------
  // Singleton
  // --------------------------------------------------------------------------------

  protected static Configuration configuration = new Configuration();

  private Configuration() {
    logger.debug("Creating Configuration.");
    init();
  }

  public static Configuration getInstance() {
    return configuration;
  }

  // --------------------------------------------------------------------------------
  // Getters / Setters
  // --------------------------------------------------------------------------------

  public String getResourceId() {
    return resourceId;
  }

  public void setResourceId(String resourceId) {
    this.resourceId = resourceId;
  }

  public String getCfApiUrl() {
    return cfApiUrl;
  }

  public void setCfApiUrl(String cfApiUrl) {
    this.cfApiUrl = cfApiUrl;
  }

  public String getAppId() {
    return appId;
  }

  public void setAppId(String appId) {
    this.appId = appId;
  }

  public String getSpaceId() {
    return spaceId;
  }

  public void setSpaceId(String spaceId) {
    this.spaceId = spaceId;
  }

  public String getOrgId() {
    return orgId;
  }

  public void setOrgId(String orgId) {
    this.orgId = orgId;
  }

  public String getAbacusOperationUser() {
    return abacusOperationUser;
  }

  public void setAbacusOperationUser(String abacusOperationUser) {
    this.abacusOperationUser = abacusOperationUser;
  }

  public String getAbacusOperationPassword() {
    return abacusOperationPassword;
  }

  public void setAbacusOperationPassword(String abacusOperationPassword) {
    this.abacusOperationPassword = abacusOperationPassword;
  }

  public String getAbacusOperationToken() {
    if (this.abacusOperationToken == null || !this.abacusOperationToken.isValid())
      this.setAbacusOperationToken(this.getNewAbacusOperationToken());
    return abacusOperationToken.getTokenString();
  }

  public void setAbacusOperationToken(OAuthToken abacusOperationToken) {
    this.abacusOperationToken = abacusOperationToken;
  }

  public String getCfTokenUrl() {
    if (this.cfTokenUrl == null)
      this.setCfTokenUrl(this.resolveCfTokenUrl());
    return cfTokenUrl;
  }

  public void setCfTokenUrl(String cfTokenUrl) {
    this.cfTokenUrl = cfTokenUrl;
  }

  public String getAbacusUsageCollectorUrl() {
    return abacusUsageCollectorUrl;
  }

  public void setAbacusUsageCollectorUrl(String abacusUsageCollectorUrl) {
    this.abacusUsageCollectorUrl = abacusUsageCollectorUrl;
  }

  // --------------------------------------------------------------------------------
  // Methods / Functions
  // --------------------------------------------------------------------------------

  /**
   * Returns true if it seems like the app is currently running in a CF environment.
   * <p>
   * Note: Whether the app is running in a CF environment or not is detected by
   * checking the existence of the VCAP_APPLICATION environment variable.
   * CF provides some information there, e.g. URL to CF API, app ID, or space ID.
   */
  public boolean isCFEnvironment() {
    return (System.getenv(ENV_VAR_NAME_CF_APP_INFO) != null);
  }

  /**
   * Initialize the Configuration class (this method is called in the constructor).
   * The main task of this method is to get additional information about the app,
   * which we'll need later on, when we want to report our usage data. The information
   * gathered is e.g. ID of app, ID of space we run into, and ID of organization the
   * space belongs to.
   */
  protected void init() {

    try {
      // Read CF API URL, application ID, and Space ID from environment variables
      if (this.isCFEnvironment()) {
        logger.debug("Reading values from " + ENV_VAR_NAME_CF_APP_INFO + " environment variable.");
        JsonNode vcapAppValues = (new ObjectMapper()).readTree(System.getenv(ENV_VAR_NAME_CF_APP_INFO));
        this.setCfApiUrl(vcapAppValues.get("cf_api").asText());
        this.setAppId(vcapAppValues.get("application_id").asText());
        this.setSpaceId(vcapAppValues.get("space_id").asText());
        this.setOrgId(System.getenv(ENV_VAR_NAME_ORG_GUID));

        logger.debug("Reading values from " + ENV_VAR_NAME_CF_SERVICES_INFO + " enviroment variable");

        JsonNode servicesAppValues = (new ObjectMapper()).readTree(System.getenv(ENV_VAR_NAME_CF_SERVICES_INFO));
        ArrayNode jsonArr = (ArrayNode) servicesAppValues.get("metering");

        this.setAbacusOperationUser(jsonArr.findValue("client_id").asText());
        this.setAbacusOperationPassword(jsonArr.findValue("client_secret").asText());
        this.setResourceId(jsonArr.findValue("resource_id").asText());
        this.setAbacusUsageCollectorUrl(jsonArr.findValue("collector_url").asText());

      } else {
        // If there is no VCAP_APPLICATION environment variable set
        logger.error(ENV_VAR_NAME_CF_APP_INFO + " environment variable not set, please set it manually if not running in CF environment, " +
            "e.g.: VCAP_APPLICATION={\"cf_api\": <cf api url here here>, " +
            "\"application_id\":\"a5579765-f471-4c2f-a300-e87afa32828b\", " +
            "\"space_id\":\"0e7eced3-ce39-433d-baa6-41cdf9743bcb\"}");
      }
      logger.debug("CF API URL                 = '" + this.getCfApiUrl() + "'");
      logger.debug("Application ID             = '" + this.getAppId() + "'");
      logger.debug("Space ID                   = '" + this.getSpaceId() + "'");

      // Call CF API to figure out token endpoint to use for getting oAuth tokens
      logger.debug("CF Token URL     = '" + this.getCfTokenUrl() + "'");

      // Call CF API to figure out ID of organization that the space belongs to
      // resolveOrganizationId();
      logger.debug("Organization ID            = '" + this.getOrgId() + "'");

    } catch (Exception e) {
      logger.warn("Exception while initializing configuration: " + e.getMessage(), e);
    }

  }

  /**
   * Get CF token endpoint from CF API.
   */
  protected String resolveCfTokenUrl() {
    String result = null;
    try {
      String requestUrl = this.getCfApiUrl() + "/v2/info";
      String responseString = NetworkHelper.readFromURL(requestUrl, null);

      JsonNode responseJson = (new ObjectMapper()).readTree(responseString);
      result = responseJson.get("token_endpoint").asText() + "/oauth/token";
    } catch (Exception e) {
      logger.warn("Exception while resolving token URL from CF API: " + e.getMessage(), e);
    }
    return result;
  }

  /**
   * Get an OAuth2 access token for communication with Abacus.
   */
  protected OAuthToken getNewAbacusOperationToken() {
    return NetworkHelper.getNewOAuthToken(this.getAbacusOperationUser(), this.getAbacusOperationPassword(), this.getCfTokenUrl());
  }

}
