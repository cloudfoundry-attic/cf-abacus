/* eslint-disable max-len*/
angular.module('appRoutes', ['ui.router', 'translation']).config(['$stateProvider', '$locationProvider', function($stateProvider, $locationProvider) {
  $stateProvider
    .state('home', {
      url: '/manage/instances/:instance_id/bindings/:binding_id/:plan_id',
      templateUrl: 'components/home/HomeView.html',
      controller: 'HomeViewController',
      controllerAs: 'hvc',
      ncyBreadcrumb: {
        label: '{{\'ResourceProvider_BreadCrumb_Home\' | translate}}'
      },
      resolve: {
        trans: ['translationFactory',
          function(translation) {
            return translation('home');
          }]
      }
    })
    .state('metering', {
      url: '/manage/instances/:instance_id/bindings/:binding_id/metering/:plan_id',
      templateUrl: 'components/metering/MeteringView.html',
      controller: 'MeteringViewController',
      controllerAs: 'mvc',
      ncyBreadcrumb: {
        label: '{{planId}}',
        parent: 'home'
      },
      resolve: {
        trans: ['translationFactory', function(translation) {
          return translation('metering');
        }]
      }
    })
    .state('addmetric', {
      url: '/manage/instances/:instance_id/bindings/:binding_id/metering/:plan_id/metric',
      templateUrl: 'components/metrics/MetricsView.html',
      controller: 'MetricsViewController',
      controllerAs: 'metricsCtrl',
      ncyBreadcrumb: {
        label: 'Add metric',
        parent: 'metering'
      },
      resolve: {
        trans: ['translationFactory', function(translation) {
          return translation('metrics');
        }]
      }
    })
    .state('metric', {
      url: '/manage/instances/:instance_id/bindings/:binding_id/metering/:plan_id/metrics/:metric_name',
      templateUrl: 'components/metrics/MetricsView.html',
      controller: 'MetricsViewController',
      controllerAs: 'metricsCtrl',
      ncyBreadcrumb: {
        label: '<a class="dropdown-toggle" data-toggle="dropdown"  href="#">' +
        '{{metric_name}} <span class="caret"></span>' +
        '</a>' +
        '<ul class="dropdown-menu" role="menu" aria-labelledby="dropdownmenu">' +
        '{{dropdown}}' +
        '</ul>',
        parent: 'metering'
      },
      resolve: {
        trans: ['translationFactory', function(translation) {
          return translation('metrics');
        }]
      }
    });
  $locationProvider.html5Mode(true);
}]);
