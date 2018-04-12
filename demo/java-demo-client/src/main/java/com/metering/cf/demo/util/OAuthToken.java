package com.metering.cf.demo.util;

import java.util.Date;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class OAuthToken {

  // --------------------------------------------------------------------------------
  // Logger
  // --------------------------------------------------------------------------------

  private static final Logger logger = LoggerFactory.getLogger(OAuthToken.class);

  // --------------------------------------------------------------------------------
  // Attributes
  // --------------------------------------------------------------------------------

  protected String tokenString = null;
  protected long tokenValidity = -1;

  // --------------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------------

  /**
   * OAuthToken constructor
   * <p>
   * The created object will store
   * - tokenString: The given token as-is as a string.
   * - tokenValidity: The point in time (in milliseconds since January 1, 1970, 00:00:00 GMT) when the token turns invalid.
   * <p>
   * Note: Value of tokenValidity is calculated by adding the parameter expiresIn to the current time,
   * and then subtracting a buffer of 1000 milliseconds (1 second).
   *
   * @param token     Token itself as a String
   * @param expiresIn Time in milliseconds from now, when the token will expire
   */
  public OAuthToken(String tokenString, long expiresIn) {
    this.setTokenString(tokenString);
    this.setTokenValidity(new Date().getTime() + expiresIn - 1000);
  }

  // --------------------------------------------------------------------------------
  // Getters / Setters
  // --------------------------------------------------------------------------------

  public String getTokenString() {
    return this.tokenString;
  }

  public void setTokenString(String tokenString) {
    this.tokenString = tokenString;
  }

  public long getTokenValidity() {
    return this.tokenValidity;
  }

  public void setTokenValidity(long tokenValidity) {
    this.tokenValidity = tokenValidity;
  }

  // --------------------------------------------------------------------------------
  // Functions / Methods
  // --------------------------------------------------------------------------------

  public boolean isValid() {
    boolean result = (new Date().getTime() < this.tokenValidity);
    logger.debug("OAuthToken.isValid(): " + result);
    return result;
  }

}
