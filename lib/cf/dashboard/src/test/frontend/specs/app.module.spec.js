'use strict';
/* eslint-disable no-var, max-len*/
describe('app module', function() {
  var breadcrumbProviderSpy, translateProviderSpy, translatePartialLoaderProviderSpy;

  describe('bredcrumb config', function() {
    beforeEach(function() {
      module('ncy-angular-breadcrumb');
      module(function($breadcrumbProvider) {
        breadcrumbProviderSpy = $breadcrumbProvider;
        spyOn(breadcrumbProviderSpy, 'setOptions');
      });
      module('Resource-Provider');
      inject();
    });

    it('should test config setOptions', function() {
      expect(breadcrumbProviderSpy.setOptions).toHaveBeenCalledWith({
        templateUrl: 'components/partials/breadcrumb.html'
      });
    });
  });

  describe('translate config', function() {
    beforeEach(function() {
      module('pascalprecht.translate');
      module(function($translateProvider, $translatePartialLoaderProvider) {
        translateProviderSpy = $translateProvider;
        translatePartialLoaderProviderSpy = $translatePartialLoaderProvider;
        spyOn(translateProviderSpy, 'useSanitizeValueStrategy').and.returnValue(translateProviderSpy);
        spyOn(translateProviderSpy, 'preferredLanguage').and.returnValue(translateProviderSpy);
        spyOn(translateProviderSpy, 'fallbackLanguage').and.returnValue(translateProviderSpy);
        spyOn(translateProviderSpy, 'useLoader');
        spyOn(translatePartialLoaderProviderSpy, 'addPart');
      });
      module('Resource-Provider');
      inject();
    });

    it('should test translatePartialLoaderProvider config', function() {
      expect(translatePartialLoaderProviderSpy.addPart.calls.count()).toBe(3);
      expect(translatePartialLoaderProviderSpy.addPart.calls.allArgs()).toEqual([[ 'home' ], [ 'services' ], [ 'userProfile' ]]);
    });

    it('should test translateProvider Config', function() {
      expect(translateProviderSpy.useSanitizeValueStrategy).toHaveBeenCalledWith(null);
      expect(translateProviderSpy.preferredLanguage).toHaveBeenCalledWith('en');
      expect(translateProviderSpy.fallbackLanguage).toHaveBeenCalledWith('en');
      expect(translateProviderSpy.useLoader).toHaveBeenCalledWith('$translatePartialLoader', {
        urlTemplate: 'components/{part}/i18n/locale-{lang}.json'
      });
    });
  });

  describe('app run', function() {
    var translateSpy, rootScope;
    beforeEach(function() {
      module('pascalprecht.translate');
      module('Resource-Provider', function($provide) {
        $provide.value('$translate', {
          refresh: jasmine.createSpy(),
          use: jasmine.createSpy(),
          storageKey: jasmine.createSpy(),
          storage: jasmine.createSpy(),
          preferredLanguage: jasmine.createSpy()
        });
      });

      inject(function($translate, _$rootScope_) {
        translateSpy = $translate;
        rootScope = _$rootScope_;
      });
    });

    it('should call refresh on $translatePartialLoaderStructureChanged event', function() {
      rootScope.$emit('$translatePartialLoaderStructureChanged');
    });

    it('should call use on $translateChangeEnd event', function() {
      rootScope.$emit('$translateChangeEnd');
      expect(translateSpy.use).toHaveBeenCalled();
    });


  });


});

