/* eslint-disable max-len*/
angular.module('Resource-Provider', ['appRoutes', 'ui.bootstrap', 'HomeViewModule', 'ngSanitize',
  'ngAnimate', 'MeteringViewModule', 'MetricsViewModule', 'ui.ace', 'ResourceProviderService',
  'MessageBoxService', 'ncy-angular-breadcrumb', 'ngclipboard','httpInterceptor',
  'Resource-Provider.userProfile','pascalprecht.translate'
])
  .filter('trustAsHtml', function($sce) {
    return $sce.trustAsHtml;
  })
  .directive('contenteditable', function() {
    return {
      require: 'ngModel',
      scope: {},
      link: function(scope, elm, attr, ctrl) {
        elm.bind('blur', function() {
          scope.$apply(function() {
            ctrl.$setViewValue(elm.html().trim());
          });
        });
        ctrl.$render = function() {
          elm.html(ctrl.$viewValue);
        };
      }
    };
  })
  .config(['$breadcrumbProvider', '$translateProvider', '$translatePartialLoaderProvider',
    function($breadcrumbProvider, $translateProvider, $translatePartialLoaderProvider) {
      $breadcrumbProvider.setOptions({
        templateUrl: 'components/partials/breadcrumb.html'
      });
      // preload home,service and userProfile
      $translatePartialLoaderProvider.addPart('home');
      $translatePartialLoaderProvider.addPart('services');
      $translatePartialLoaderProvider.addPart('userProfile');
      $translateProvider
        .useSanitizeValueStrategy(null)
        .preferredLanguage('en')
        .fallbackLanguage('en')
        .useLoader('$translatePartialLoader', {
          urlTemplate: 'components/{part}/i18n/locale-{lang}.json'
        });
    }])
  .run(function($rootScope, $translate) {
    // translate refresh is necessary to load translate table
    $rootScope.$on('$translatePartialLoaderStructureChanged', function() {
      $translate.refresh();
    });
    $rootScope.$on('$translateChangeEnd', function() {
      $rootScope.currentLanguage = $translate.use();
    });
  });
