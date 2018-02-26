'use strict';
/* eslint-disable max-len, no-var */
describe('controller:: userProfile/contollers/userProfile.controller.js', function() {
  var $httpBackend, controller, $scope,service;
  beforeEach(function() {
    module('Resource-Provider.userProfile');
  });

  beforeEach(inject(function($rootScope, $controller, _$httpBackend_,_userProfileService_) {
    $httpBackend = _$httpBackend_;
    $scope = $rootScope.$new();
    service = _userProfileService_;
    $httpBackend.whenGET('/userProfile/getUser').respond({ 'data' : 'XYZ' });
    $httpBackend.whenGET('/userProfile/getThemeUploadFeatureFlag').respond('true');
    $httpBackend.expectGET('/userProfile/getUser');
    $httpBackend.expectGET('/userProfile/getThemeUploadFeatureFlag');
    controller = $controller('userProfileController', {
      $scope: $scope,
      service: service
    });
    $httpBackend.flush();
  }));

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });

  describe('test loading controller', function() {
    it('should load controller successfully', function() {
      expect(controller).toBeDefined();
    });
  });
});


