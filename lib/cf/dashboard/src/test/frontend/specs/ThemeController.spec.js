'use strict';
/* eslint-disable max-len, no-var */
describe('controller:: userProfile/contollers/theme.controller.js', function() {
  var $httpBackend, controller, modal, $scope,service;
  beforeEach(function() {
    module('Resource-Provider.userProfile');
    module('ui.bootstrap');
  });

  beforeEach(inject(function($rootScope, $controller, $uibModal, _$httpBackend_,_themeService_) {
    $httpBackend = _$httpBackend_;
    modal = $uibModal;
    $scope = $rootScope.$new();
    service = _themeService_;
    controller = $controller('themeController', {
      $scope: $scope,
      modal: modal,
      service: service
    });
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

  describe('showModalDialog', function() {
    var mockThemeData = readJSON('mock/themes.json');
    var mockThemePref = { 'data':'ABC' };
    it('should test open the modal dialog ', function() {
      $httpBackend.whenGET('/userProfile/getThemePreference').respond(mockThemePref);
      $httpBackend.whenGET('/userProfile/getThemeMetadata').respond(mockThemeData);
      $httpBackend.expectGET('components/userProfile/templates/themeModalTemplate.html').respond(200);
      $httpBackend.expectGET('/userProfile/getThemePreference');
      $httpBackend.expectGET('/userProfile/getThemeMetadata');
      spyOn(controller, 'showModalDialog').and.callThrough();
      controller.showModalDialog();
      $httpBackend.flush();
      expect(controller.showModalDialog).toHaveBeenCalled();
    });

    it('should test not opening the modal dialog, because one of the call fails ', function() {
      $httpBackend.whenGET('/userProfile/getThemePreference').respond(401);
      $httpBackend.whenGET('/userProfile/getThemeMetadata').respond(mockThemeData);
      $httpBackend.expectGET('components/userProfile/templates/themeModalTemplate.html').respond(200);
      $httpBackend.expectGET('/userProfile/getThemePreference');
      $httpBackend.expectGET('/userProfile/getThemeMetadata');
      spyOn(controller, 'showModalDialog').and.callThrough();
      controller.showModalDialog();
      $httpBackend.flush();
      expect(controller.showModalDialog).toHaveBeenCalled();
    });

    it('should test window location reload ', function() {
      var w = {};
      w.location = {};
      w.location.reload = function() {};
      spyOn(controller,'windowReload').and.callThrough();
      controller.windowReload(w);
      expect(controller.windowReload).toHaveBeenCalledWith(w);
    });
  });
});
