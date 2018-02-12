/* eslint-disable max-len, no-var */
describe('Resource Provider Service', function() {
  var httpBackend, services, $rootScope;
  beforeEach(module('ResourceProviderService'));

  beforeEach(inject(function(_ResourceProviderFactory_, _$httpBackend_, _$rootScope_) {
    httpBackend = _$httpBackend_;
    services = _ResourceProviderFactory_;
    $rootScope = _$rootScope_;
  }));

  afterEach(function() {
    httpBackend.verifyNoOutstandingExpectation();
    httpBackend.verifyNoOutstandingRequest();
  });

  it('should call success on get plan', function() {
    httpBackend.expectGET('v1/metering/plans/test-metering-plan').respond(200, {});
    var response;
    services.getMeteringPlan('test-metering-plan').success(function(result) {
      response = result;
    });
    httpBackend.flush();
    expect(response).toBeDefined();
  });

  it('should call failure on get plan', function() {
    httpBackend.expectGET('v1/metering/plans/test-metering-plan').respond(401, {});
    var response;
    services.getMeteringPlan('test-metering-plan').catch(function(result) {
      response = result;
    });
    httpBackend.flush();
    expect(response).toBeDefined();
  });

  it('should call success on put metering plan', function() {
    httpBackend.expectPUT('v1/metering/plans/test-metering-plan').respond(201, {});
    var response;
    services.updateMeteringPlan('test-metering-plan').success(function(result) {
      response = result;
    });
    httpBackend.flush();
    expect(response).toBeDefined();
  });

  it('should call failure on put metering plan', function() {
    httpBackend.expectPUT('v1/metering/plans/test-metering-plan').respond(401, {});
    var response;
    services.updateMeteringPlan('test-metering-plan').catch(function(result) {
      response = result;
    });
    httpBackend.flush();
    expect(response).toBeDefined();
  });

  it('should set iscreatemode flag on setMetricCreateMode call', function() {
    services.setMetricCreateMode();
    expect(services.isMetricCreateMode).toBe(true);
  });

  it('should set iscreatemode flag on setMetricCreateMode call', function() {
    services.resetMetricCreateMode();
    expect(services.isMetricCreateMode).toBe(false);
  });

  it('shoud set isLoadingSpinnerActive on openLoadingSpinner call', function() {
    services.openLoadingSpinner();
    expect($rootScope.isLoadingSpinnerActive).toBe(true);
  });

  it('shoud set isLoadingSpinnerActive on openLoadingSpinner call', function() {
    services.closeLoadingSpinner();
    expect($rootScope.isLoadingSpinnerActive).toBe(false);
  });

  it('should be by default isMetricEditMode false', function() {
    expect(services.isMetricEditMode).toBe(false);
  });
});
