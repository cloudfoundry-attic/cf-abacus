/* eslint-disable max-len,no-var*/
angular.module('httpInterceptor', []).factory('interceptorFactory',
  ['$injector', '$q', '$stateParams', function($injector, $q, $stateParams) {
    var $window = null;

    var setLocation = function(path) {
      if (!$window)
        $window = $injector.get('$window');
      $window.location.href = path;
    };

    var alertDialog = function(msg) {
      if (!$window)
        $window = $injector.get('$window');
      $window.alert(msg);
    };

    var interceptor = {
      request: function(config) {
        config.headers['X-WebApp-Request'] = true;
        return config;
      },
      responseError: function(response) {
        if (response.status === 401 && response.headers('X-Session-Expiry') === 'true') {
          interceptor.alertDialog('Your session has expired. Please log on again to continue working.');
          if (angular.isDefined($stateParams.instance_id))
            return interceptor.setLocation('/v1/logout?instance_id=' + $stateParams.instance_id);
          return interceptor.setLocation('/v1/logout?force=true');
        }
        return $q.reject(response);
      },
      alertDialog: alertDialog,
      setLocation: setLocation
    };
    return interceptor;
  }])
  .config(['$httpProvider', function($httpProvider) {
    $httpProvider.interceptors.push('interceptorFactory');
  }]);
