'use strict';

/* eslint no-var: 0 */
/* eslint-disable max-len */

angular.module('Resource-Provider.userProfile').directive('userProfile', function() {
  return {
    templateUrl: '/components/userProfile/templates/userProfileTemplate.html',
    restrict: 'E',
    controller : 'userProfileController',
    controllerAs : 'UPC',
    bindToController : true,
    scope: {

    },
    link: function(scope, element, attrs) {}
  };
});
