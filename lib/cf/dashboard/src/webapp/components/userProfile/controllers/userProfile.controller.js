'use strict';

/* eslint no-var: 0 */
/* eslint-disable max-len */

angular.module('Resource-Provider.userProfile').controller('userProfileController', ['userProfileService','$scope', function(service,$scope) {
  var that = this;
  that.userProfile = {};

  service.getUserProfile()
    .then(function(res) {
      that.userProfile.email = !_.isUndefined(res) ? res.data.email : [];
    }, function(err, result) {
      console.log(err);
    });

  service.getUploadFeatureFlag()
    .then(function(res) {
      var flag = res.data === '' ? false : res.data;
      $scope.$root.uploadThemeFeatureFlag = flag;
    }, function(err, result) {
      console.log(err);
    });
}]);
