/* eslint-disable max-len,no-var */
angular.module('ResourceProviderService', [])
  .factory('ResourceProviderFactory', ['$http', '$rootScope', '$compile', '$interpolate',function($http, $rootScope, $compile, $interpolate) {

    ResourceProviderFactory = {};
    ResourceProviderFactory.isMetricEditMode = false;
    ResourceProviderFactory.defaultMeteringPane = 'measures';

    ResourceProviderFactory.getMeteringPlan = function(meteringPlanId) {
      return $http.get('v1/metering/plans/' + meteringPlanId);
    };
    
    ResourceProviderFactory.updateMeteringPlan = function(meteringPlanId, data, config) {
      return $http.put('v1/metering/plans/' + meteringPlanId, data);
    };


    ResourceProviderFactory.updateAllPlans = function(planId, metricId, data, config) {
      return $http.put('v1/plans/' + planId + '/metrics/' + metricId, data);
    };

    ResourceProviderFactory.getSampleUsageDocument = function(planId) {
      return $http.get('v1/metering/usage_doc/' + planId);
    };

    ResourceProviderFactory.pushSampleUsageDocument = function(data) {
      return $http.post('v1/collector/usage_doc',data);
    };

    ResourceProviderFactory.openLoadingSpinner = function(scope) {
      $rootScope.isLoadingSpinnerActive = true;
    };

    ResourceProviderFactory.setMetricCreateMode = function(mode) {
      ResourceProviderFactory.isMetricCreateMode = true;
    };

    ResourceProviderFactory.getMetricCreateMode = function(mode) {
      return ResourceProviderFactory.isMetricCreateMode;
    };

    ResourceProviderFactory.resetMetricCreateMode = function(mode) {
      ResourceProviderFactory.isMetricCreateMode = false;
    };

    ResourceProviderFactory.closeLoadingSpinner = function() {
      $rootScope.isLoadingSpinnerActive = false;
    };

    ResourceProviderFactory.constructErrorMessage = function(msgKey, actee, statusText) {
      return ResourceProviderFactory.getMessage(msgKey) + ' "' + actee + '"' + ' : ' + statusText + '.';
    };

    ResourceProviderFactory.getMessage = function(key) {
      return $rootScope.messagebundle[key];
    };

    ResourceProviderFactory.getPlan = function() {
      return ResourceProviderFactory.plan;
    };

    ResourceProviderFactory.getMetricsDropdown = function(plan, selected, scope) {
      // boilerplate for dropdown should get rid of it
      var planId = plan.plan_id;
      var bindingId = scope.binding_id;
      var instanceId = scope.instance_id;
      var metrics = _.sortBy(plan.metrics, [function(o) {
        return o.name;
      }]);
      var html = '';
      for (var index = 0; index < metrics.length; index++) {
        var name = metrics[index].name;
        var isSelected = angular.equals(selected, name);
        var cssClass = isSelected ? 'showIcon' : 'hideIcon';
        html += '<li><a href="/manage/instances/' + instanceId + '/bindings/' + bindingId + '/metering/' +
          planId + '/metrics/' + name + '">' +
          '<span>' + name + '</span>' +
          '<i style="margin-left:15px" class="glyphicon glyphicon-ok clickable ' + cssClass + '"';
        html += '></i></a></li>';
      }
      return html;
    };

    ResourceProviderFactory.getSampleFunctions = function() {
      return $http.get('/components/templates.json');

    };

    return ResourceProviderFactory;
  }]);
