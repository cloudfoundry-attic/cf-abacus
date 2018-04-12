'use strict';

/* eslint no-var: 0 */
/* eslint-disable max-len */

angular.module('Resource-Provider.userProfile').controller('themeModalController', ['$uibModalInstance', '$scope','themeService','MessageBox', function(uibModalInstance, $scope, themeService,MessageBox) {
  var that = this;
  that.title = 'Select Themes';
  that.type = 'selTheme';
  that.messageBundle = $scope.$resolve.messageBundle;
  that.availableUploadedThemes = [];
  that.selectedUploadedTheme = '';
  that.isDisable = true;
  that.themePreference = '';
  var flag = $scope.$parent.uploadThemeFeatureFlag;
  that.uploadFeatureFlag = flag == 'true';

  that.selectedThemeChange = function(item) {
    that.isDisable = false;
    that.selectedUploadedTheme = item.filename;
    that.themePreference = item.displayname;
    that.themeType = item.themeType;
  };

  that.onSave = function() {
    themeService.toggleLoadingIcon(that);
    themeService.saveUserPreference({
      'themePreference': that.selectedUploadedTheme
    },that.themeType)
      .then(function(result) {
        themeService.toggleLoadingIcon(that);
        uibModalInstance.close();
      },function(err,result) {
        themeService.toggleLoadingIcon(that);
      });
  };
  that.onClose = function() {
    uibModalInstance.dismiss('cancel');
  };
  that.uploadFile = function(applyFlag) {
    that.isDisable = false;
    themeService.toggleLoadingIcon(that);
    var file = that.customThemeFile;
    themeService.uploadFileToDB(file)
      .then(function(response) {
        themeService.toggleLoadingIcon(that);
        if(applyFlag) {
          that.selectedUploadedTheme = that.upFileName;
          that.onSave();
        }

        that.upFileName = 'No file chosen';
      }, function(err, response) {
        themeService.toggleLoadingIcon(that);
        MessageBox.openErrorBox(err.data);
        console.log(err);
      });
  };
  that.populateUploadedTheme = function() {
    themeService.toggleLoadingIcon(that);
    themeService.getUploadedThemes()
      .then(function(res) {
        var resData = res.data;
        for(var i = 0; i < resData.length;i++)
          if(!resData[i].displayname)
            resData[i].displayname = resData[i].filename.split('.css')[0];

        that.availableUploadedThemes = resData;
        themeService.toggleLoadingIcon(that);
      }, function(err, result) {
        themeService.toggleLoadingIcon(that);
      });
  };
  that.getThemePreference = function() {
    themeService.getThemePreference()
      .then(function(res) {
        if(!_.isUndefined(res)) that.themePreference = res.data;
      }, function(err, result) {
        themeService.toggleLoadingIcon(that);
      });
  };

  that.getThemePreference();
  that.populateUploadedTheme();

  that.isItemSelected = function(item) {
    if (that.themePreference === '') return false;

    var tmpItem;
    for (var i = 0; i < that.availableUploadedThemes.length; i++) {
      tmpItem = that.availableUploadedThemes[i];
      if (typeof tmpItem !== 'undefined' &&
        tmpItem.displayname.toUpperCase() === that.themePreference.toUpperCase() &&
        tmpItem.displayname.toUpperCase() === item.displayname.toUpperCase())
        return true;
    }
    return false;
  };
}]);
