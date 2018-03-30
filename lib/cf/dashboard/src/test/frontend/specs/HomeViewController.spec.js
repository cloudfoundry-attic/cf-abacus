'use strict';
/* eslint-disable max-len, no-var */
describe('controller:: HomeViewModuleController', function() {
  var $controller, scope, $httpBackend, controller, $stateParams;
  beforeEach(function() {
    module('HomeViewModule');
    module('ui.bootstrap');
    module('pascalprecht.translate');
  });

  beforeEach(inject(function(_$rootScope_, _$controller_, _$httpBackend_,_$translate_) {
    $controller = _$controller_;
    scope = _$rootScope_;
    $httpBackend = _$httpBackend_;
  }));

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });

  describe('should load data successfully', function() {
    var mockData = readJSON('mock/plan.json');
    beforeEach(function() {
      $stateParams = {
        plan_id: 'test-metering-plan'
      };
      $httpBackend.expectGET('v1/metering/plans/test-metering-plan').respond(200, mockData);
      controller = $controller('HomeViewController', {
        $scope: scope,
        $stateParams: $stateParams,
        trans :{}
      });
      $httpBackend.flush();

    });
    it('should set scope plan on succcesful initcontroller ', function() {
      expect(scope.plans).toEqual([mockData]);
    });

    it('should validate formatMetric metrhid', function() {
      expect(controller.formatMeasures(scope.plans[0].measures)).toBe('current_instance_memory, current_running_instances, previous_instance_memory, previous_running_instances');
    });

    afterEach(function() {
      $httpBackend.verifyNoOutstandingExpectation();
      $httpBackend.verifyNoOutstandingRequest();
    });

    describe('view usage dilaog test', function() {
      var spinnerOpenSpy, spinnerCloseSpy, getMessageSpy;
      beforeEach(function() {
        spinnerOpenSpy = spyOn(ResourceProviderFactory, 'openLoadingSpinner').and.callThrough();
        spinnerCloseSpy = spyOn(ResourceProviderFactory, 'closeLoadingSpinner').and.callThrough();
        getMessageSpy = spyOn(ResourceProviderFactory, 'getMessage').and.returnValue('');

      });

      afterEach(function() {
        spinnerCloseSpy.calls.reset();
        spinnerOpenSpy.calls.reset();
        getMessageSpy.calls.reset();
      });

      it('should test view usage doc success', function() {
        $httpBackend.expectGET('v1/metering/usage_doc/test-metering-plan').respond(200);
        $httpBackend.expectGET('components/home/viewUsageDocDialog.html').respond(200);
        controller.onViewUsageClick();
        expect(spinnerOpenSpy).toHaveBeenCalled();
        $httpBackend.flush();
        expect(spinnerCloseSpy).toHaveBeenCalled();
      });

      it('should test view usage doc on failure', function() {
        $httpBackend.expectGET('v1/metering/usage_doc/test-metering-plan').respond(401);
        $httpBackend.expectGET('components/partials/ErrorBox.html').respond(200);
        controller.onViewUsageClick();
        expect(spinnerOpenSpy).toHaveBeenCalled();
        $httpBackend.flush();
        expect(spinnerCloseSpy).toHaveBeenCalled();
      });


      it('should test viewusage controller ', function() {
        var modalScope = scope.$new();
        var modalInstance = {
          close: jasmine.createSpy('modalInstance.close'),
          dismiss: jasmine.createSpy('modalInstance.dismiss'),
          result: {
            then: jasmine.createSpy('modalInstance.result.then')
          }
        };
        var data = { 'test': 'dewfewf' };
        $controller('ViewUsageController', {
          $scope: modalScope,
          $uibModalInstance: modalInstance,
          data: data
        });
        expect(modalScope.doc.usageDoc).toEqual(JSON.stringify(data, undefined, 2));
      });

      it('submit usage dialog test on success', function() {

        $httpBackend.expectGET('v1/metering/usage_doc/test-metering-plan')
          .respond(200, readJSON('mock/usage-document.json'));
        $httpBackend.expectGET('components/home/submitUsageDocDialog.html')
          .respond(200);
        controller.onSubmitUsageClick();
        expect(spinnerOpenSpy).toHaveBeenCalled();
        $httpBackend.flush();
        expect(spinnerCloseSpy).toHaveBeenCalled();
      });

      it('submit usage dialog test on failure', function() {
        $httpBackend.expectGET('v1/metering/usage_doc/test-metering-plan')
          .respond(400);
        $httpBackend.expectGET('components/partials/ErrorBox.html')
          .respond(200);
        controller.onSubmitUsageClick();
        expect(spinnerOpenSpy).toHaveBeenCalled();
        $httpBackend.flush();
        expect(spinnerCloseSpy).toHaveBeenCalled();
      });

      describe('SubmitUsageController', function() {
        var modalScope;
        var modalInstance = {
          close: jasmine.createSpy('modalInstance.close'),
          dismiss: jasmine.createSpy('modalInstance.dismiss'),
          result: {
            then: jasmine.createSpy('modalInstance.result.then')
          }
        };
        var mockData = readJSON('mock/usage-document.json');

        beforeEach(function() {
          modalScope = scope.$new();
          $controller('SubmitUsageController', {
            $scope: modalScope,
            $uibModalInstance: modalInstance,
            data: mockData
          });
        });

        it('should test initial flags', function() {
          expect(modalScope.doc.isUsageDocSubmitted).toBe(false);
          expect(modalScope.doc.oneAtATime).toBe(false);
          expect(modalScope.doc.isUsageDocOpen).toBe(true);
          expect(modalScope.doc.usageDoc)
            .toBe(JSON.stringify(mockData, undefined, 2));
        });

        it('test onOk method', function() {
          modalScope.onOk();
          expect(modalInstance.dismiss).toHaveBeenCalled();
        });

        it('should test onSubmit method success', function() {
          var mockResponse = readJSON('mock/post-usage-response.json');
          $httpBackend.expectPOST('v1/collector/usage_doc').respond(201,
            mockResponse);
          modalScope.onSubmit();
          expect(spinnerOpenSpy).toHaveBeenCalled();
          $httpBackend.flush();
          expect(modalScope.doc.isUsageRespSuccess).toBe(true);
          expect(modalScope.doc.isUsageDocSubmitted).toBe(true);
          expect(modalScope.doc.isUsageRespOpen).toBe(true);
          expect(modalScope.doc.isUsageDocOpen).toBe(false);
          expect(modalScope.doc.isUsageRespDisable).toBe(false);
          expect(modalScope.doc.usageResp).toEqual(JSON.stringify(mockResponse, undefined, 2));
          expect(spinnerCloseSpy).toHaveBeenCalled();
        });

        it('should test onSubmit failure', function() {
          var mockResponse = {
            'statusCode': 409,
            'statusMessage': 'Conflict'
          };
          $httpBackend.expectPOST('v1/collector/usage_doc').respond(409,
            mockResponse);
          modalScope.onSubmit();
          expect(spinnerOpenSpy).toHaveBeenCalled();
          $httpBackend.flush();
          expect(modalScope.doc.isUsageRespSuccess).toBe(false);
          expect(modalScope.doc.isUsageDocSubmitted).toBe(true);
          expect(modalScope.doc.isUsageRespOpen).toBe(true);
          expect(modalScope.doc.isUsageDocOpen).toBe(false);
          expect(modalScope.doc.isUsageRespDisable).toBe(false);
          expect(modalScope.doc.usageResp).toEqual(JSON.stringify(mockResponse, undefined, 2));
          expect(spinnerCloseSpy).toHaveBeenCalled();
        });
      });
    });


  });

  describe('should fail on loadData', function() {
    beforeEach(function() {
      $stateParams = {
        plan_id: 'test-metering-plan'
      };
      $httpBackend.expectGET('v1/metering/plans/test-metering-plan').respond(500);
      $controller('HomeViewController', {
        $scope: scope,
        $stateParams: $stateParams,
        trans :{}
      });
      spyOn(ResourceProviderFactory, 'getMessage').and.returnValue('');
      $httpBackend.expectGET('components/partials/ErrorBox.html').respond(200);
      $httpBackend.flush();
    });
    it('should not set scope plan on  initcontroller failure ', function() {
      expect(scope.plans).toEqual([]);
    });
  });


});
