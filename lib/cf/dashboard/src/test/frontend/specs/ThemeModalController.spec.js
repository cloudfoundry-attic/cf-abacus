'use strict';
/* eslint-disable max-len, no-var */
describe('controller:: userProfile/contollers/themeModal.controller.js', function() {
  var $httpBackend, controller, $scope, service,$uibModalInstance;
  beforeEach(function() {
    module('Resource-Provider.userProfile');
    module('ui.bootstrap');
  });

  beforeEach(inject(function($rootScope, $controller, _$httpBackend_, _themeService_) {
    $httpBackend = _$httpBackend_;
    $scope = $rootScope.$new();
    service = _themeService_;
    $uibModalInstance = jasmine.createSpyObj('$uibModalInstance', ['close', 'dismiss']);
    $httpBackend.whenGET('/userProfile/getThemePreference').respond(400);
    $httpBackend.whenGET('/userProfile/getThemeMetadata').respond(400);
    $httpBackend.expectGET('/userProfile/getThemePreference');
    $httpBackend.expectGET('/userProfile/getThemeMetadata');
    $scope.$resolve = {};
    $scope.$resolve.messageBundle = {};
    controller = $controller('themeModalController', {
      $scope: $scope,
      $uibModalInstance: $uibModalInstance,
      service: service
    });
    $httpBackend.flush();
    controller.$resolve = {};
    controller.$resolve.messageBundle = {};
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

  describe('selected theme changes function', function() {
    it('should call this function and set the selected theme', function() {
      controller.selectedThemeChange({ 'filename' : 'abc','themeType' : 'other' });
      expect(controller.themeType).toEqual('other');
    });
  });

  describe('uibmodal close function', function() {
    it('checks the modalinstance close', function() {
      $uibModalInstance.dismiss('cancel');
      controller.onClose();
      expect($uibModalInstance.dismiss).toBeDefined();
      expect($uibModalInstance.dismiss).toHaveBeenCalledWith('cancel');
    });
  });

  describe('Theme modal menu theme selection', function() {
    var item = { 'displayname' : 'ABC', 'filename' : 'ABC.css' };
    beforeEach(function() {
      controller.availableUploadedThemes = readJSON('mock/themes.json');
    });
    it('checks which theme has been selected from the available themes, when themePreference is set', function() {
      controller.themePreference = 'ABC';
      spyOn(controller, 'isItemSelected').and.callThrough();
      controller.isItemSelected(item);
      expect(controller.isItemSelected).toHaveBeenCalled();
    });
    it('checks which theme has been selected from the available themes, when themePreference is not set', function() {
      controller.themePreference = '';
      spyOn(controller, 'isItemSelected').and.callThrough();
      controller.isItemSelected(item);
      expect(controller.isItemSelected).toHaveBeenCalled();
    });
    it('checks which theme has been selected from the available themes, when available themes is empty', function() {
      controller.availableUploadedThemes = [];
      controller.themePreference = 'ABC';
      spyOn(controller, 'isItemSelected').and.callThrough();
      controller.isItemSelected(item);
      expect(controller.isItemSelected).toHaveBeenCalled();
    });
  });
  describe('save of theme preference' , function() {
    beforeEach(function() {
      controller.selectedUploadedTheme = 'ABC.css';
    });
    it('when themeType is default, and delete succeeds',function() {
      controller.themeType = 'defaultTheme';
      $httpBackend.whenDELETE('/userProfile/removePrefAndLoadPreDefTheme').respond(200);
      $httpBackend.expectDELETE('/userProfile/removePrefAndLoadPreDefTheme');
      spyOn(controller,'onSave').and.callThrough();
      controller.onSave();
      $httpBackend.flush();
      expect(controller.onSave).toHaveBeenCalled();
    });

    it('when themeType is default, and delete fails',function() {
      controller.themeType = 'defaultTheme';
      $httpBackend.whenDELETE('/userProfile/removePrefAndLoadPreDefTheme').respond(400);
      $httpBackend.expectDELETE('/userProfile/removePrefAndLoadPreDefTheme');
      spyOn(controller,'onSave').and.callThrough();
      controller.onSave();
      $httpBackend.flush();
      expect(controller.onSave).toHaveBeenCalled();
    });

    it('when themeType is other, and put succeeds',function() {
      controller.themeType = 'other';
      $httpBackend.whenPUT('/userProfile/saveThemePreference').respond(200);
      $httpBackend.expectPUT('/userProfile/saveThemePreference');
      spyOn(controller,'onSave').and.callThrough();
      controller.onSave();
      $httpBackend.flush();
      expect(controller.onSave).toHaveBeenCalled();
    });

    it('when themeType is empty for custom uploaded, and put succeeds',function() {
      controller.themeType = '';
      $httpBackend.whenPUT('/userProfile/saveThemePreference').respond(200);
      $httpBackend.expectPUT('/userProfile/saveThemePreference');
      spyOn(controller,'onSave').and.callThrough();
      controller.onSave();
      $httpBackend.flush();
      expect(controller.onSave).toHaveBeenCalled();
    });
  });

  describe('file upload',function() {
    it('uploads file successfuly',function() {
      controller.customThemeFile = { 'name' : 'Theme_2.css','size' : 2970,'type':'text/css' };
      $httpBackend.whenPOST('/userProfile/cssUpload').respond(200);
      $httpBackend.expectPOST('/userProfile/cssUpload');
      spyOn(controller,'uploadFile').and.callThrough();
      controller.uploadFile();
      $httpBackend.flush();
      expect(controller.uploadFile).toHaveBeenCalled();
    });
    it('uploads file fails',function() {
      controller.customThemeFile = { 'name' : 'Theme_2.css','size' : 2970,'type':'text/css' };
      $httpBackend.whenPOST('/userProfile/cssUpload').respond(400);
      $httpBackend.expectPOST('/userProfile/cssUpload');
      $httpBackend.expectGET('components/partials/ErrorBox.html').respond(200);
      spyOn(controller,'uploadFile').and.callThrough();
      controller.uploadFile();
      $httpBackend.flush();
      expect(controller.uploadFile).toHaveBeenCalled();
    });
  });
});
