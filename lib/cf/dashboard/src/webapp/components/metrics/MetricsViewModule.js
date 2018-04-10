/* eslint-disable max-len,no-var */
angular.module('MetricsViewModule', ['ResourceProviderService', 'MessageBoxService'])
  .controller('MetricsViewController', ['$translatePartialLoader', '$translate', 'trans', 'ResourceProviderFactory',
    '$scope', '$stateParams', '$location', 'MessageBox', '$rootScope', function($translatePartialLoader, $translate,
      trans,ResourceProviderFactory, $scope, $routeParams, $location, MessageBox, $rootScope) {
      var vm = this;
      $scope.plan = ResourceProviderFactory.getPlan();
      $scope.selectedPane = null;
      $scope.planId = $routeParams.plan_id;
      $scope.instance_id = $routeParams.instance_id;
      $scope.binding_id = $routeParams.binding_id;
      $scope.metric_name = $routeParams.metric_name;
      vm.initController = function() {
        vm.setFlags();
        ResourceProviderFactory.openLoadingSpinner();
        $scope.metric = {};
        if (ResourceProviderFactory.getMetricCreateMode())
          ResourceProviderFactory.getSampleFunctions().then(function(response) {
            $scope.templates = response.data;
            _.forOwn($scope.templates, function(value, key) {
              $scope.metric[key] = value;
            });
            $scope.metric.type = 'discrete';
          });

        ResourceProviderFactory.getMeteringPlan($routeParams.plan_id).then(function(response) {
          $scope.plan = response.data;
          vm.plan = $scope.plan;
          $scope.metric = _.find($scope.plan.metrics, {
            'name': $scope.metric_name
          }) || $scope.metric;
          vm.setMetricCopy();
          vm.setDropdown();
          ResourceProviderFactory.closeLoadingSpinner();
        }, function(response) {
          $scope.plan = {};
          ResourceProviderFactory.closeLoadingSpinner();
          var msg = $translate.instant('ResourceProvider_ErrorBox_GetPlan_XMSG', { planId:$scope.planId,statusText: response.statusText });
          MessageBox.openErrorBox(msg);
        });
      };

      vm.setDropdown = function() {
        $scope.planId = $routeParams.plan_id;
        $scope.instance_id = $routeParams.instance_id;
        $scope.binding_id = $routeParams.binding_id;
        $scope.metric_name = $routeParams.metric_name;
        $scope.dropdown = ResourceProviderFactory.getMetricsDropdown($scope.plan, $scope.metric_name, $scope);
      };

      vm.setFlags = function() {
        $scope.isReadOnly = !ResourceProviderFactory.getMetricCreateMode();
        $scope.isCreateMetricMode = !ResourceProviderFactory.getMetricCreateMode();
      };

      vm.onLoad = function(editor) {
        editor.setShowPrintMargin(false);
        $scope.editor = editor;
        $scope.editor.setOptions({
          minLines: 10,
          wrap: true,
          firstLineNumber: 1,
          enableBasicAutocompletion: true,
          enableSnippets: true,
          enableLiveAutocompletion: true
        });
      };

      vm.onEditMetricClick = function() {
        vm.setPlanCopy();
        vm.resetReadOnly();
      };

      vm.setPlanCopy = function() {
        $scope.planCopy = angular.copy($scope.plan);
      };


      vm.navigateBackToMetering = function() {
        if (ResourceProviderFactory.getMetricCreateMode()) {
          $location.path($location.$$path.substr(0, $location.$$path.lastIndexOf('/')));
          ResourceProviderFactory.resetMetricCreateMode();
        }else {
          var path = $location.$$path.substr(0, $location.$$path.lastIndexOf('/'));
          $location.path(path.substr(0, path.lastIndexOf('/')));
        }
      };

      vm.onCancelMetricClick = function() {
        $scope.metricsCtrl.metricform.$setPristine();
        if (ResourceProviderFactory.getMetricCreateMode()) {
          vm.setFlags();
          // navigate back to metering view;
          vm.navigateBackToMetering();
        }else {
          vm.setReadOnly();
          $scope.metric = vm.getMetricCopy();
          $scope.paneChanged();
        }
      };

      vm.onDeleteMetricClick = function(metric) {
        var metric = $scope.metric;
        var title = $translate.instant('ResourceProvider_Metric_DeleteAction_Box_XTIT');
        var message = $translate.instant('ResourceProvider_Metric_DeleteAction_Box_XMSG', { metricName:metric.name });
        $scope.messageBoxInstance = MessageBox.openMessageBox(title, message);
        $scope.messageBoxInstance.result.then(function() {
          vm.onDeleteMetricConfirm(metric);
        });
      };

      vm.onDeleteMetricConfirm = function() {
        var planCopy = angular.copy($scope.plan);
        // keep metric copy on failure assign it to original
        var metricCopy = angular.copy($scope.metric);
        _.remove(planCopy.metrics, {
          'name': metricCopy.name
        });
        ResourceProviderFactory.openLoadingSpinner();
        ResourceProviderFactory.updateMeteringPlan(planCopy.plan_id, planCopy).then(function() {
          vm.setReadOnly();
          ResourceProviderFactory.closeLoadingSpinner();
          vm.navigateBackToMetering();
        }, function(response) {
          vm.setReadOnly();
          ResourceProviderFactory.closeLoadingSpinner();
          var msg = $translate.instant('ResourceProvider_ErrorBox_DeleteMetric_XMSG',{ metricName:metricCopy.name,statusText:response.statusText });
          MessageBox.openErrorBox(msg);
        });
      };

      vm.onAddMetricConfirm = function() {
        var planCopy = angular.copy($scope.plan);
        // keep metric copy on failure assign it to original
        var metricCopy = angular.copy($scope.metric);
        var metricCopy = angular.copy($scope.metric);
        planCopy.metrics.push(metricCopy);
        ResourceProviderFactory.openLoadingSpinner();
        ResourceProviderFactory.updateAllPlans(planCopy.plan_id, $scope.metric.name, planCopy).then(function() {
          ResourceProviderFactory.closeLoadingSpinner();
          vm.navigateBackToMetering();
        }, function(response) {
          ResourceProviderFactory.closeLoadingSpinner();
          vm.navigateBackToMetering();
          var msg = $translate.instant('ResourceProvider_ErrorBox_AddMetric_XMSG', { metrcName:metricCopy.name,statusText:response.statusText }); 
          MessageBox.openErrorBox(msg);

        });
      };

      vm.onUpdateMetricConfirm = function() {
        var planCopy = angular.copy($scope.plan);
        // keep metric copy on failure assign it to original
        var newMetric = angular.copy($scope.metric);
        metricCopy = _.omitBy(newMetric, _.isEmpty);
        var index = _.findIndex($scope.plan.metrics, {
          'name': $scope.metricCopy.name
        });
        planCopy.metrics[index] = newMetric;
        var updatePromise = null;
        if (newMetric.name === vm.getMetricCopy().name)
          updatePromise = ResourceProviderFactory.updateMeteringPlan(planCopy.plan_id, planCopy);
        else
          updatePromise = ResourceProviderFactory.updateAllPlans(planCopy.plan_id, newMetric.name, planCopy);

        updatePromise.then(function() {
          vm.setReadOnly();
          $scope.metric_name = newMetric.name;
          $scope.plan = planCopy;
          $scope.dropdown = ResourceProviderFactory.getMetricsDropdown($scope.plan, $scope.metric_name, $scope);
          vm.setMetricCopy();
          ResourceProviderFactory.closeLoadingSpinner();
        }, function(response) {
          vm.setReadOnly();
          $scope.metric = vm.getMetricCopy();
          $scope.plan = $scope.planCopy;
          $scope.paneChanged();
          ResourceProviderFactory.closeLoadingSpinner();
          var msg = $translate.instant('ResourceProvider_ErrorBox_UpdateMetric_XMSG',{ metricName:metricCopy.name, statusText: response.statusText });
          MessageBox.openErrorBox(msg);
        });

      };

      vm.onSaveMetricClick = function() {
        $scope.metricsCtrl.metricform.$setPristine();
        ResourceProviderFactory.openLoadingSpinner();
        if (ResourceProviderFactory.getMetricCreateMode())
          vm.onAddMetricConfirm();
        else
          vm.onUpdateMetricConfirm();
      };

      vm.setReadOnly = function() {
        $scope.isReadOnly = true;
      };

      vm.resetReadOnly = function() {
        $scope.isReadOnly = false;
      };

      $scope.paneChanged = function(localPane) {
        var pane = null;
        if (localPane) {
          $scope.selectedPane = localPane;
          pane = localPane;
        }else
          pane = $scope.selectedPane;


        if (pane.title === 'Details')
          $scope.showAceEditor = false;
        else {
          if ($scope.plan && $scope.plan.metrics) {
            var funcValue = $scope.metric[pane.title.toLowerCase()];
            $scope.editor.getSession().setValue(funcValue || '');
          }
          $scope.showAceEditor = true;
        }
      };

      vm.onChange = function(event) {
        // //set pristine to set
        if (_.isMatch($scope.metricCopy, $scope.metric))
          $scope.metricsCtrl.metricform.$setPristine();
        else
          $scope.metricsCtrl.metricform.$setDirty();

        var newValue = $scope.editor.getSession().getValue();
        var selectedPane = $scope.selectedPane.title.toLowerCase();
        if (selectedPane !== 'details')
          $scope.metric[selectedPane] = newValue;
      };

      $scope.tabChanged = function(tab) {
        $scope.selectedTab = tab;
      };

      vm.setMetricCopy = function() {
        $scope.metricCopy = angular.copy($scope.metric);
      };

      vm.getMetricCopy = function() {
        return angular.copy($scope.metricCopy);
      };

      vm.initController();
    }])
  .directive('tabs', function() {
    return {
      restrict: 'E',
      transclude: true,
      scope: {
        paneChanged: '&'
      },
      controller: function($scope, $element) {
        var panes = $scope.panes = [];
        var preSelected = null;
        $scope.isSelected = function(pane) {
          var preSelected = $scope.$parent.selectedPane;
          if (preSelected) {
            if (preSelected.title === pane.title) {
              pane.selected = true;
              return true;
            }
            // by default first element is visible   
            pane.selected = false;
            return false;
          }
          return pane.selected;
        };
        $scope.select = function(pane) {
          pane.selected = true;
          $scope.selectedPane = pane;
          $scope.paneChanged({
            selectedPane: pane
          });
        };

        this.addPane = function(pane) {
          if (panes.length == 0 && !preSelected)
            pane.selected = true;
          else
            pane.selected = false;

          panes.push(pane);
        };
      },
      template: '<div class="tabbable">' +
      '<ul class="nav nav-tabs tabs-advanced">' +
      '<li ng-repeat="pane in panes" ng-class="{active:isSelected(pane)}">' +
      '<a href="" ng-click="select(pane)">{{pane.title}}</a>' +
      '</li>' +
      '</ul>' +
      '<div class="tab-content" ng-transclude></div>' +
      '</div>',
      replace: true
    };
  })
  .directive('pane', function() {
    return {
      require: '^tabs',
      restrict: 'E',
      transclude: true,
      scope: {
        title: '@'
      },
      link: function(scope, element, attrs, tabsCtrl) {
        tabsCtrl.addPane(scope);
      },
      template: '<div class="tab-pane" ng-class="{active: selected}" ng-transclude>' +
      '</div>',
      replace: true
    };
  });
