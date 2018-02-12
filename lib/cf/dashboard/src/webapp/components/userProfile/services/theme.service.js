'use strict';

/* eslint no-var: 0 */
/* eslint-disable max-len */

angular.module('Resource-Provider.userProfile').service('themeService', ['$http', function($http) {
  this.getmessageBundle = function() {
    return $http.get('/components/userProfile/resources/messageBundle.json');
  };
  this.uploadFileToDB = function(file) {
    var fd = new FormData();
    fd.append('file', file);
    return $http.post('/userProfile/cssUpload',
      fd, {
        transformRequest: angular.identity,
        headers: {
          'Content-Type': undefined
        }
      });
  };
  this.getUploadedThemes = function() {
    return $http.get('/userProfile/getThemeMetadata');
  };
  this.saveUserPreference = function(themeObj,themeType) {
    if(themeType === 'defaultTheme')
      return $http.delete('/userProfile/removePrefAndLoadPreDefTheme');
    
    var modThemeObj;
    if(themeType)
      modThemeObj = _.assign(themeObj,{ 'themeType' : themeType });
    else 
      modThemeObj = _.assign(themeObj,{ 'themeType' : 'custom' });
    return $http.put('/userProfile/saveThemePreference', JSON.stringify(modThemeObj));
    
  };
  this.toggleLoadingIcon = function(scope) {
    scope.isLoadingSpinnerActive = !scope.isLoadingSpinnerActive;
  };
  this.getThemePreference = function() {
    return $http.get('/userProfile/getThemePreference');
  };
}]);
