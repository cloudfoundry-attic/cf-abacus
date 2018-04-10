'use strict';

/* eslint no-var: 0 */
/* eslint-disable max-len */

angular.module('Resource-Provider.userProfile').directive('fileModel', ['$parse', function($parse) {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      var model = $parse(attrs.fileModel);
      var modelSetter = model.assign;
      scope.$parent.TMC.upFileName = 'No file chosen';
      element.bind('change', function() {
        scope.$apply(function() {
          scope.$parent.TMC.upFileName = element[0].files[0].name;
          modelSetter(scope, element[0].files[0]);
        });
      });
    }
  };
}]);
