'use strict';
/* eslint-disable no-var,max-len*/

var httpProviderIt;

describe('Service Unit Tests', function() {
  var interceptorFactory;
  var $httpBackend;
  var $http, $window, stateParams;
  beforeEach(function() {
    module('httpInterceptor', function($httpProvider) {
      // save our interceptor
      httpProviderIt = $httpProvider;
    });

    module('ui.router');
    module('ResourceProviderService');
    module(function($provide) {
      $window = { location: { href: null } };
      $window.alert = function(param) { };
      stateParams = { };
      $provide.factory('$stateParams', function() {
        return stateParams;
      });
      $provide.factory('$window', function() {
        return $window;
      });
    });
    inject(function(_interceptorFactory_, _$httpBackend_, _$http_, $window) {
      interceptorFactory = _interceptorFactory_;
      $httpBackend = _$httpBackend_;
      $http = _$http_;
    });
  });



  describe('interceptorFactory Tests', function() {

    it('should have interceptorFactory be defined', function() {
      expect(interceptorFactory).toBeDefined();
    });

    it('should have defined required method', function() {
      expect(interceptorFactory.request).toBeDefined();
      expect(interceptorFactory.responseError).toBeDefined();
      expect(interceptorFactory.alertDialog).toBeDefined();
      expect(interceptorFactory.setLocation).toBeDefined();
    });

    it('should test setLocation',function() {
      interceptorFactory.setLocation('/test/path');
      expect($window.location.href).toBe('/test/path');
    });

    it('should test alertDialog',function() {
      var alertSpy = spyOn($window,'alert').and.callThrough();
      interceptorFactory.alertDialog('test dialog message');
      expect(alertSpy).toHaveBeenCalledWith('test dialog message');
    });

    describe('HTTP tests', function() {

      it('should have the interceptorFactory as an interceptor', function() {
        expect(httpProviderIt.interceptors).toContain('interceptorFactory');
      });

      it('should have set required header on request', function() {
        $httpBackend.whenGET('/api-call', function(headers) {
          return headers['X-WebApp-Request'] === true;
        }).respond(200, { hello: 'world' });
        $http.get('/api-call');
        $httpBackend.flush();
      });

      describe('responseerror hook', function() {
        var alertDialogSpy,setLocationSpy;
        beforeEach(function() {
          alertDialogSpy = spyOn(interceptorFactory, 'alertDialog').and.callFake(function() { });
          setLocationSpy = spyOn(interceptorFactory, 'setLocation').and.callFake(function() { });
        });

        it('should call responseerror hook', function() {
          $httpBackend.whenGET('/api-call', function(headers) {
            return headers['X-WebApp-Request'] === true;
          }).respond(401, { hello: 'world' }, { 'X-Session-Expiry': true });
          $http.get('/api-call');
          $httpBackend.flush();
          expect(alertDialogSpy).toHaveBeenCalledWith('Your session has expired. Please log on again to continue working.');
          expect(setLocationSpy).toHaveBeenCalledWith('/v1/logout?force=true');
        });

        it('should call responseerror hook with stateparam instanceid', function() {
          $httpBackend.whenGET('/api-call', function(headers) {
            return headers['X-WebApp-Request'] === true;
          }).respond(401, { hello: 'world' }, { 'X-Session-Expiry': true });
          $http.get('/api-call');
          stateParams.instance_id = 'abcd12345';
          $httpBackend.flush();
          expect(setLocationSpy).toHaveBeenCalledWith('/v1/logout?instance_id=abcd12345');
        });
      });
    });
  });
});
