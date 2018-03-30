angular.module('translation', []).factory('translationFactory',
  ['$translatePartialLoader', '$translate', '$rootScope',
    function($translatePartialLoader, $translate, $rootScope) {
      return function() {
        angular.forEach(arguments, function(translationKey) {
          $translatePartialLoader.addPart(translationKey);
        });
        return $translate.refresh().then(
          function() {
            return $translate.use($rootScope.currentLanguage);
          }
        );
      };
    }]);
