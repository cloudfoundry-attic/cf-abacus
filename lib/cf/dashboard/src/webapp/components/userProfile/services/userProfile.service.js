'use strict';

/* eslint no-var: 0 */
/* eslint-disable max-len */

angular.module('Resource-Provider.userProfile').service('userProfileService', ['$http', function($http) {
  this.getUserProfile = function() {
    return $http.get('/userProfile/getUser');
  };
  this.getUploadFeatureFlag = function() {
    return $http.get('/userProfile/getThemeUploadFeatureFlag');
  };
}]);
