package com.metering.cf.demo.util;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URL;

import javax.net.ssl.HttpsURLConnection;
import javax.ws.rs.core.Form;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

import org.apache.cxf.jaxrs.client.WebClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.Base64Utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class NetworkHelper {

  // --------------------------------------------------------------------------------
  // Logger
  // --------------------------------------------------------------------------------

  private static final Logger logger = LoggerFactory.getLogger(NetworkHelper.class);

  // --------------------------------------------------------------------------------
  // Methods / functions
  // --------------------------------------------------------------------------------

  /**
   * Read String from URL. oAuthToken is optional. If value is not null,
   * Authorization header with token will be added to the GET request.
   */
  public static String readFromURL(String urlString, String oAuthToken) {

    String result = null;

    try {
      HttpsURLConnection con = (HttpsURLConnection) new URL(urlString).openConnection();
      if (oAuthToken != null)
        con.setRequestProperty("Authorization", oAuthToken);
      con.setUseCaches(false);

      StringBuffer responseBody = new StringBuffer();
      String lineRead = null;
      try (BufferedReader in = new BufferedReader(new InputStreamReader(con.getInputStream()))) {
        while ((lineRead = in.readLine()) != null)
          responseBody.append(lineRead);
      }
      result = responseBody.toString();

    } catch (Exception e) {
      logger.warn("Something went wrong reading from URL '" + urlString + "': " + e.getMessage(), e);
    }

    return result;

  }

  /**
   * Get an OAuth2 access token for given user and password from given tokenUrl.
   * <p>
   * Function will return an OAuthToken object.
   * <p>
   * Note: This object's tokenString attribute will store the token prefixed with
   * the token type, so it can be directly inserted into the authorization
   * header when doing a request.
   * <p>
   * Example: Server response of
   * <p>
   * { [...]
   * "access_token": "ey47110815",
   * "token_type": "bearer",
   * [...] }
   * <p>
   * will lead to a tokenString of : "bearer ey47110815".
   */
  public static OAuthToken getNewOAuthToken(String user, String password, String tokenUrl) {
    OAuthToken result = null;
    try {
      WebClient webClient = WebClient.create(tokenUrl).accept(MediaType.APPLICATION_JSON_TYPE);
      webClient.header("Content-Type", "application/x-www-form-urlencoded");
      webClient.header("Authorization", "Basic " + new String(Base64Utils.encode((user + ":" + password).getBytes("UTF-8")), "UTF-8"));
      Form body = new Form().param("grant_type", "client_credentials");
      Response response = webClient.post(body);
      String responseString = response.readEntity(String.class);
      JsonNode responseJson = (new ObjectMapper()).readTree(responseString);
      if (responseJson.has("error")) {
        String errorMsg = responseJson.get("error").toString();
        if (responseJson.has("error_description"))
          errorMsg += " - " + responseJson.get("error_description").toString();
        if (errorMsg.length() < 1)
          errorMsg = responseString;
        logger.warn("Something went wrong getting new OAuth access token for user '" + user + "' from token URL '" + tokenUrl + "': " + errorMsg);
      } else {
        if (responseJson.has("token_type") && responseJson.has("access_token") && responseJson.has("expires_in")) {
          String tokenString = responseJson.get("token_type").asText() + " " + responseJson.get("access_token").asText();
          long expiresIn = responseJson.get("expires_in").asLong();
          result = new OAuthToken(tokenString, expiresIn * 1000);
        } else {
          logger.warn("Something went wrong getting new OAuth access token for user '" + user + "' from token URL '" + tokenUrl + "'. Received unexpected response content: '" + responseString + "'");
        }
      }
    } catch (Exception e) {
      logger.warn("Something went wrong getting new OAuth access token for user '" + user + "' from token URL '" + tokenUrl + "': " + e.getMessage(), e);
    }
    return result;
  }

}
