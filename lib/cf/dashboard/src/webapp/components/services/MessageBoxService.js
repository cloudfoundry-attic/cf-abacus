/* eslint-disable max-len,no-var */
angular.module('MessageBoxService', [])
  .factory('MessageBox', ['$uibModal','$rootScope' ,function($uibModal,$scope) {
    var service = {};

    service.openMessageBox = function(title,message) {

      var controller = function($scope, $uibModalInstance) {
        $scope.message = message;
        $scope.messageBoxTitle = title;
        $scope.onOk = function() {
          $uibModalInstance.close();
        };
        $scope.onClose = function() {
          $uibModalInstance.dismiss('cancel');
        };
      };

      return $uibModal.open({
        templateUrl: 'components/partials/MessageBox.html',
        controller: controller,
        scope : $scope
      });
    };
    service.openErrorBox = function(message) {
      var controller = function($scope, $uibModalInstance) {
        $scope.message = message;
        $scope.onOk = function() {
          $uibModalInstance.dismiss('cancel');
        };
      };

      $uibModal.open({
        templateUrl: 'components/partials/ErrorBox.html',
        controller: controller
      });
    };
    return service;
  }]);
