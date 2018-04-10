'use strict';
/* eslint-disable max-len, no-var */
describe('controller:: Metering View Controller', function() {
  var $httpBackend, $controller, modal, scope, $stateParams;
  beforeEach(function() {
    module('MeteringViewModule');
    module('ui.bootstrap');
    module('pascalprecht.translate');
  });

  beforeEach(inject(function(_$rootScope_, _$controller_, $uibModal, _$httpBackend_) {
    scope = _$rootScope_;
    $httpBackend = _$httpBackend_;
    $controller = _$controller_;
    modal = $uibModal;
  }));

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });

  describe('should load data successfully', function() {
    var mockData = readJSON('mock/plan.json');
    var controller;
    beforeEach(function() {
      $stateParams = {
        plan_id: 'test-metering-plan'
      };
      $httpBackend.expectGET('v1/metering/plans/test-metering-plan').respond(200, mockData);
      controller = $controller('MeteringViewController', {
        $scope: scope,
        $uibModal: modal,
        $stateParams: $stateParams,
        trans :{}
      });
      $httpBackend.flush();
    });

    afterEach(function() {
      $httpBackend.verifyNoOutstandingExpectation();
      $httpBackend.verifyNoOutstandingRequest();
    });


    it('should set scope plan on succcesful initcontroller ', function() {
      expect(scope.plan).toEqual(mockData);
    });

    describe('Add measure Dialog Test', function() {
      var initControllerSpy, updateMetringPlanSpy;
      beforeEach(function() {
        spyOn(ResourceProviderFactory, 'getMessage').and.returnValue('');
        initControllerSpy = spyOn(controller, 'initController').and.callFake(function() { });
        updateMetringPlanSpy = spyOn(ResourceProviderFactory, 'updateMeteringPlan').and.callThrough();
      });

      it('should call updatemetering function on success add measures', function() {
        $httpBackend.expectGET('components/metering/templates/add-measure-dialog.html').respond(200);
        controller.onAddMeasureClick();
        $httpBackend.flush();
        $httpBackend.expectPUT('v1/metering/plans/test-metering-plan').respond(201);
        scope.modalInstance.close({
          'name': 'new-measure',
          'unit': 'new-unit'
        });
        $httpBackend.flush();
        expect(initControllerSpy).toHaveBeenCalled();
        expect(updateMetringPlanSpy).toHaveBeenCalledWith(mockData.plan_id, readJSON('mock/add-measure-plan.json'));
      });

      it('should not call updatemetering function on failure add measures', function() {
        $httpBackend.expectGET('components/metering/templates/add-measure-dialog.html').respond(200);
        controller.onAddMeasureClick();
        controller.onAddMeasureClick();
        $httpBackend.flush();
        $httpBackend.expectPUT('v1/metering/plans/test-metering-plan').respond(500);
        $httpBackend.expectGET('components/partials/ErrorBox.html').respond(200);
        scope.modalInstance.close({
          'name': 'test',
          'unit': 'test1234'
        });
        $httpBackend.flush();
        expect(initControllerSpy).not.toHaveBeenCalled();
      });
    });

    describe('edit measure Dialog Test', function() {
      var initControllerSpy, updateMetricConfirmSpy, updateMetringPlanSpy;
      beforeEach(function() {
        spyOn(ResourceProviderFactory, 'getMessage').and.returnValue('');
        initControllerSpy = spyOn(controller, 'initController').and.callFake(function() { });
        updateMetricConfirmSpy = spyOn(controller, 'onUpdateMeasureConfirm').and.callThrough();
        updateMetringPlanSpy = spyOn(ResourceProviderFactory, 'updateMeteringPlan').and.callThrough();
      });

      it('should call updatemetering function on success edit measure', function() {
        $httpBackend.expectGET('components/metering/templates/add-measure-dialog.html').respond(200);
        controller.onEditMeasureClick({
          'name': 'previous_running_instances',
          'unit': 'NUMBER'
        }, 3);
        $httpBackend.flush();
        $httpBackend.expectPUT('v1/metering/plans/test-metering-plan').respond(201);
        var pairs = [{
          'name': 'newmeasure',
          'unit': 'test1234'
        }, {
          'name': 'previous_running_instances',
          'unit': 'NUMBER'
        }];
        scope.modalInstance.close(pairs);
        $httpBackend.flush();
        expect(initControllerSpy).toHaveBeenCalled();
        expect(updateMetricConfirmSpy).toHaveBeenCalledWith(pairs);
        expect(updateMetringPlanSpy).toHaveBeenCalledWith(mockData.plan_id, readJSON('mock/edit-measure-plan.json'));
      });

      it('should not call updatemetering function on failure edit measure', function() {
        $httpBackend.expectGET('components/metering/templates/add-measure-dialog.html').respond(200);
        controller.onEditMeasureClick({
          'name': 'previous_running_instances',
          'unit': 'NUMBER'
        }, 0);
        $httpBackend.flush();
        $httpBackend.expectPUT('v1/metering/plans/test-metering-plan').respond(500);
        $httpBackend.expectGET('components/partials/ErrorBox.html').respond(200);
        scope.modalInstance.close([{
          'name': 'newmeasure',
          'unit': 'test1234'
        }, {
          'name': 'measure',
          'unit': 'test1234'
        }]);
        $httpBackend.flush();
        expect(initControllerSpy).not.toHaveBeenCalled();
      });
    });

    describe('delete measure Test', function() {
      var initControllerSpy, deleteConfirmSpy, updateMetringPlanSpy;
      beforeEach(function() {
        spyOn(ResourceProviderFactory, 'getMessage').and.returnValue('');
        initControllerSpy = spyOn(controller, 'initController').and.callFake(function() { });
        deleteConfirmSpy = spyOn(controller, 'onDeleteMeasureConfirm').and.callThrough();
        updateMetringPlanSpy = spyOn(ResourceProviderFactory, 'updateMeteringPlan').and.callThrough();
      });

      it('should call updatemetering function on success delete measure', function() {
        $httpBackend.expectGET('components/partials/MessageBox.html').respond(200);
        controller.onDeleteMeasureClick({
          'name': 'previous_running_instances',
          'unit': 'NUMBER'
        }, 3);
        $httpBackend.flush();
        $httpBackend.expectPUT('v1/metering/plans/test-metering-plan').respond(201);
        scope.messageBoxInstance.close({
          'name': 'previous_running_instances',
          'unit': 'NUMBER'
        });
        $httpBackend.flush();
        expect(deleteConfirmSpy).toHaveBeenCalled();
        expect(initControllerSpy).toHaveBeenCalled();
        expect(updateMetringPlanSpy).toHaveBeenCalledWith(mockData.plan_id, readJSON('mock/delete-measure-plan.json'));
      });

      it('should not call updatemetering function on failure add measures', function() {
        $httpBackend.expectGET('components/partials/MessageBox.html').respond(200);
        controller.onDeleteMeasureClick({ name: 'measure', unit: 'unit' }, 0);
        $httpBackend.flush();
        $httpBackend.expectPUT('v1/metering/plans/test-metering-plan').respond(500);
        $httpBackend.expectGET('components/partials/ErrorBox.html').respond(200);
        scope.messageBoxInstance.close({
          'name': 'test',
          'unit': 'test1234'
        });
        $httpBackend.flush();
        expect(deleteConfirmSpy).toHaveBeenCalled();
        expect(initControllerSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('should  not load data on failure', function() {
    beforeEach(function() {
      $httpBackend.expectGET('v1/metering/plans/test-metering-plan').respond(500);
      $controller('MeteringViewController', {
        $scope: scope,
        $stateParams: $stateParams,
        trans :{}
      });
      $httpBackend.expectGET('components/partials/ErrorBox.html').respond(200);
      spyOn(ResourceProviderFactory, 'getMessage').and.returnValue('');
      $httpBackend.flush();

    });
    it('should set scope plan on succcesful initcontroller ', function() {
      expect(scope.plan).toEqual({});
    });

    afterEach(function() {
      $httpBackend.verifyNoOutstandingExpectation();
      $httpBackend.verifyNoOutstandingRequest();
    });

  });
});
