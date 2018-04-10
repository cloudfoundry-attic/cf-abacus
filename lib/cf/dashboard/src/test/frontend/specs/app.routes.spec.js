'use strict';
/* eslint-disable no-var, max-len*/
describe('myApp/myState', function() {

  var $state, state, $httpBackend;
  var myServiceMock = jasmine.createSpy('translationFactory');
  myServiceMock.and.callFake(function() { });

  beforeEach(function() {

    module('translation');
    module('ui.router');
    module('appRoutes', function($provide) {
      $provide.value('translationFactory', myServiceMock);
    });

    inject(function(_$state_, _$httpBackend_) {
      $state = _$state_;
      $httpBackend = _$httpBackend_;
    });
  });

  afterEach(function() {
    myServiceMock.calls.reset();
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });

  describe('home state test', function() {
    beforeEach(function() {
      state = 'home';
    });
    it('should respond to home URL', function() {
      expect(
        $state.href(
          state, { instance_id: 'instance_id', binding_id: 'binding_id', plan_id: 'plan_id' }))
        .toEqual('/manage/instances/instance_id/bindings/binding_id/plan_id');
    });

    it('should resolve data', function() {
      $httpBackend.expectGET('components/home/HomeView.html').respond(200);
      $state.go(state);
      $httpBackend.flush();
      expect($state.current.name).toBe(state);
      expect(myServiceMock).toHaveBeenCalledWith('home');
    });
  });

  describe('metering state test', function() {
    beforeEach(function() {
      state = 'metering';
    });
    it('should respond to metering URL', function() {
      expect(
        $state.href(
          state, { instance_id: 'instance_id', binding_id: 'binding_id', plan_id: 'plan_id' }))
        .toEqual('/manage/instances/instance_id/bindings/binding_id/metering/plan_id');
    });

    it('should resolve data', function() {
      $httpBackend.expectGET('components/metering/MeteringView.html').respond(200);
      $state.go(state);
      $httpBackend.flush();
      expect($state.current.name).toBe(state);
      expect(myServiceMock).toHaveBeenCalledWith('metering');
    });
  });

  describe('metering state test', function() {
    beforeEach(function() {
      state = 'metering';
    });
    it('should respond to metering URL', function() {
      expect(
        $state.href(
          state, { instance_id: 'instance_id', binding_id: 'binding_id', plan_id: 'plan_id' }))
        .toEqual('/manage/instances/instance_id/bindings/binding_id/metering/plan_id');
    });

    it('should resolve data', function() {
      $httpBackend.expectGET('components/metering/MeteringView.html').respond(200);
      $state.go(state);
      $httpBackend.flush();
      expect($state.current.name).toBe(state);
      expect(myServiceMock).toHaveBeenCalledWith('metering');
    });
  });

  describe('addmetric state test', function() {
    beforeEach(function() {
      state = 'addmetric';
    });
    it('should respond to metering URL', function() {
      expect(
        $state.href(
          state, { instance_id: 'instance_id', binding_id: 'binding_id', plan_id: 'plan_id' }))
        .toEqual('/manage/instances/instance_id/bindings/binding_id/metering/plan_id/metric');
    });

    it('should resolve data', function() {
      $httpBackend.expectGET('components/metrics/MetricsView.html').respond(200);
      $state.go(state);
      $httpBackend.flush();
      expect($state.current.name).toBe(state);
      expect(myServiceMock).toHaveBeenCalledWith('metrics');
    });
  });

  describe('addmetric state test', function() {
    beforeEach(function() {
      state = 'metric';
    });
    it('should respond to metering URL', function() {
      expect(
        $state.href(
          state, { instance_id: 'instance_id', binding_id: 'binding_id', plan_id: 'plan_id', metric_name: 'metric_name' }))
        .toEqual('/manage/instances/instance_id/bindings/binding_id/metering/plan_id/metrics/metric_name');
    });

    it('should resolve data', function() {
      $httpBackend.expectGET('components/metrics/MetricsView.html').respond(200);
      $state.go(state);
      $httpBackend.flush();
      expect($state.current.name).toBe(state);
      expect(myServiceMock).toHaveBeenCalledWith('metrics');
    });
  });


});
