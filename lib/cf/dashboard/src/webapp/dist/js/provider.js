/*
 abacus-ext-service-dashboard 2017-12-14 
*/
"user strict";

angular.module("Resource-Provider.userProfile", [ "MessageBoxService" ]), angular.module("httpInterceptor", []).factory("interceptorFactory", [ "$injector", "$q", "$stateParams", function(a, b, c) {
    var d = null, e = function(b) {
        d || (d = a.get("$window")), d.location.href = b;
    }, f = function(b) {
        d || (d = a.get("$window")), d.alert(b);
    }, g = {
        request: function(a) {
            return a.headers["X-WebApp-Request"] = !0, a;
        },
        responseError: function(a) {
            return 401 === a.status && "true" === a.headers("X-Session-Expiry") ? (g.alertDialog("Your session has expired. Please log on again to continue working."), 
            angular.isDefined(c.instance_id) ? g.setLocation("/v1/logout?instance_id=" + c.instance_id) : g.setLocation("/v1/logout?force=true")) : b.reject(a);
        },
        alertDialog: f,
        setLocation: e
    };
    return g;
} ]).config([ "$httpProvider", function(a) {
    a.interceptors.push("interceptorFactory");
} ]), angular.module("translation", []).factory("translationFactory", [ "$translatePartialLoader", "$translate", "$rootScope", function(a, b, c) {
    return function() {
        return angular.forEach(arguments, function(b) {
            a.addPart(b);
        }), b.refresh().then(function() {
            return b.use(c.currentLanguage);
        });
    };
} ]), angular.module("HomeViewModule", [ "ResourceProviderService", "MessageBoxService", "ngclipboard" ]).controller("HomeViewController", [ "$translatePartialLoader", "$translate", "trans", "ResourceProviderFactory", "$scope", "$stateParams", "MessageBox", "$uibModal", function(a, b, c, d, e, f, g, h) {
    var i = this;
    e.plans = [], e.planId = f.plan_id, e.instance_id = f.instance_id, e.binding_id = f.binding_id, 
    d.instance_id = f.instance_id, d.binding_id = f.binding_id, d.plan_id = f.plan_id, 
    i.initController = function(a) {
        d.openLoadingSpinner(), d.getMeteringPlan(e.planId).then(function(a) {
            e.plans.push(a.data), d.closeLoadingSpinner();
        }, function(a) {
            d.closeLoadingSpinner();
            var c = b.instant("ResourceProvider_ErrorBox_GetPlan_XMSG", {
                planId: e.planId,
                statusText: a.statusText
            });
            g.openErrorBox(c);
        });
    }, i.formatMeasures = function(a) {
        var b = function(a) {
            return a.name;
        };
        return a.map(b).join(", ");
    }, i.onSubmitUsageClick = function() {
        d.openLoadingSpinner(), d.getSampleUsageDocument(e.planId).then(function(a) {
            d.closeLoadingSpinner(), e.modalInstance = h.open({
                templateUrl: "components/home/submitUsageDocDialog.html",
                backdrop: "static",
                windowClass: "usage-modal",
                controller: "SubmitUsageController",
                resolve: {
                    data: a.data
                }
            });
        }).catch(function(a) {
            d.closeLoadingSpinner();
            var c = b.instant("ResourceProvider_ErrorBox_usageDialog_XMSG", {
                statusText: a.statusText
            });
            g.openErrorBox(c);
        });
    }, i.onViewUsageClick = function() {
        d.openLoadingSpinner(), d.getSampleUsageDocument(e.planId).then(function(a) {
            d.closeLoadingSpinner(), e.modalInstance = h.open({
                templateUrl: "components/home/viewUsageDocDialog.html",
                backdrop: "static",
                windowClass: "usage-modal",
                controller: "ViewUsageController",
                resolve: {
                    data: a.data
                }
            });
        }).catch(function(a) {
            d.closeLoadingSpinner();
            var c = b.instant("ResourceProvider_ErrorBox_usageDialog_XMSG", {
                statusText: a.statusText
            });
            g.openErrorBox(c);
        });
    }, i.initController();
} ]).controller("ViewUsageController", [ "$scope", "$uibModalInstance", "data", function(a, b, c) {
    a.doc = {}, a.doc.usageDoc = JSON.stringify(c, void 0, 2), a.onOk = function() {
        b.dismiss("cancel");
    };
} ]).controller("SubmitUsageController", [ "$scope", "$uibModalInstance", "data", function(a, b, c) {
    a.doc = {}, a.doc.isUsageDocSubmitted = !1, a.doc.oneAtATime = !1, a.doc.isUsageDocOpen = !0, 
    a.doc.isUsageRespDisable = !0, a.doc.usageDoc = JSON.stringify(c, void 0, 2), a.onOk = function() {
        b.dismiss("cancel");
    }, a.onSubmit = function() {
        ResourceProviderFactory.openLoadingSpinner(), ResourceProviderFactory.pushSampleUsageDocument(a.doc.usageDoc).then(function(b) {
            a.doc.isUsageRespSuccess = !0, a.doc.usageResp = JSON.stringify(b.data, void 0, 2);
        }).catch(function(b) {
            a.doc.isUsageRespSuccess = !1, a.doc.usageResp = JSON.stringify(b.data, void 0, 2);
        }).finally(function() {
            a.doc.isUsageDocSubmitted = !0, a.doc.isUsageRespOpen = !0, a.doc.isUsageDocOpen = !1, 
            a.doc.isUsageRespDisable = !1, ResourceProviderFactory.closeLoadingSpinner();
        });
    };
} ]), angular.module("MeteringViewModule", [ "ResourceProviderService", "MessageBoxService" ]).controller("MeteringViewController", [ "$translatePartialLoader", "$translate", "trans", "ResourceProviderFactory", "$scope", "$uibModal", "$stateParams", "$location", "MessageBox", "$rootScope", function(a, b, c, d, e, f, g, h, i, j) {
    var k = this;
    e.plan = {}, e.sortType = "name", e.sortReverse = !1, e.planId = g.plan_id, e.instance_id = g.instance_id, 
    e.binding_id = g.binding_id, e.selectedPane = j.selectedPane, k.initController = function(a) {
        d.resetMetricCreateMode(), d.openLoadingSpinner(), d.getMeteringPlan(g.plan_id).then(function(a) {
            e.plan = a.data, d.plan = e.plan, d.closeLoadingSpinner();
        }, function(a) {
            d.closeLoadingSpinner(), i.openErrorBox(d.constructErrorMessage("ResourceProvider_ErrorBox_GetPlan_XMSG", e.planId, a.statusText));
        });
    }, k.onAddMeasureClick = function() {
        e.modalInstance = f.open({
            templateUrl: "components/metering/templates/add-measure-dialog.html",
            backdrop: "static",
            controller: [ "$scope", "$uibModalInstance", function(a, c) {
                var d = {};
                a.newMeasureName = null, a.newMeasureUnit = null, a.title = b.instant("ResourceProvider_AddMeasure_Dialog_XTIT"), 
                a.onSave = function() {
                    d = {
                        name: a.newMeasureName,
                        unit: a.newMeasureUnit
                    }, c.close(d);
                }, a.onClose = function() {
                    c.dismiss("cancel");
                };
            } ]
        }), e.modalInstance.result.then(function(a) {
            k.onAddMeasureConfirm(a);
        });
    }, k.onAddMeasureConfirm = function(a) {
        d.openLoadingSpinner();
        var c = angular.copy(e.plan);
        c.measures.push(a), d.updateMeteringPlan(c.plan_id, c).then(function(a) {
            k.initController();
        }, function(c) {
            d.closeLoadingSpinner();
            var e = b.instant("ResourceProvider_ErrorBox_AddMeasure_XMSG", {
                measureName: a.name,
                statusText: c.statusText
            });
            i.openErrorBox(e);
        });
    }, k.onEditMeasureClick = function(a, c) {
        e.modalInstance = f.open({
            templateUrl: "components/metering/templates/add-measure-dialog.html",
            backdrop: "static",
            controller: [ "$scope", "$uibModalInstance", function(c, d) {
                c.oldMeasurePair = a, c.newMeasureName = a.name, c.newMeasureUnit = a.unit, c.isEditMode = !0, 
                c.title = b.instant("ResourceProvider_UpdateMeasure_Dialog_XTIT"), c.onSave = function() {
                    newMeasurePair = {
                        name: c.newMeasureName,
                        unit: c.newMeasureUnit
                    }, d.close([ newMeasurePair, a ]);
                }, c.onClose = function() {
                    d.dismiss("cancel");
                };
            } ]
        }), e.modalInstance.result.then(function(a) {
            k.onUpdateMeasureConfirm(a);
        });
    }, k.onUpdateMeasureConfirm = function(a) {
        var c = a[0], f = a[1];
        d.openLoadingSpinner();
        var g = angular.copy(e.plan), h = _.findIndex(e.plan.measures, {
            name: f.name
        });
        g.measures[h] = c, d.updateMeteringPlan(g.plan_id, g).then(function(a) {
            k.initController();
        }, function(a) {
            d.closeLoadingSpinner();
            var c = b.instant("ResourceProvider_ErrorBox_UpdateMeasure_XMSG", {
                measureName: f.name,
                statusText: a.statusText
            });
            i.openErrorBox(c);
        });
    }, k.onDeleteMeasureClick = function(a, c) {
        var d = b.instant("ResourceProvider_Measure_DeleteAction_Box_XTIT"), f = b.instant("ResourceProvider_Measure_DeleteAction_Box_XMSG", {
            measureName: a.name
        });
        e.messageBoxInstance = i.openMessageBox(d, f), e.messageBoxInstance.result.then(function(b) {
            k.onDeleteMeasureConfirm(a);
        });
    }, k.onDeleteMeasureConfirm = function(a) {
        d.openLoadingSpinner();
        var c = angular.copy(e.plan);
        _.remove(c.measures, {
            name: a.name
        }), d.updateMeteringPlan(c.plan_id, c).then(function(a) {
            k.initController();
        }, function(c) {
            d.closeLoadingSpinner();
            var e = b.instant("ResourceProvider_ErrorBox_DeleteMeasure_XMSG", {
                measureName: a.name,
                statusText: c.statusText
            });
            i.openErrorBox(e);
        });
    }, k.onAddMetricClick = function() {
        d.setMetricCreateMode(!0), h.path(h.$$path + "/metric");
    }, e.paneChanged = function(a) {
        e.selectedPane = a, j.selectedPane = a;
    }, k.initController();
} ]), angular.module("MetricsViewModule", [ "ResourceProviderService", "MessageBoxService" ]).controller("MetricsViewController", [ "$translatePartialLoader", "$translate", "trans", "ResourceProviderFactory", "$scope", "$stateParams", "$location", "MessageBox", "$rootScope", function(a, b, c, d, e, f, g, h, i) {
    var j = this;
    e.plan = d.getPlan(), e.selectedPane = null, e.planId = f.plan_id, e.instance_id = f.instance_id, 
    e.binding_id = f.binding_id, e.metric_name = f.metric_name, j.initController = function() {
        j.setFlags(), d.openLoadingSpinner(), e.metric = {}, d.getMetricCreateMode() && d.getSampleFunctions().then(function(a) {
            e.templates = a.data, _.forOwn(e.templates, function(a, b) {
                e.metric[b] = a;
            }), e.metric.type = "discrete";
        }), d.getMeteringPlan(f.plan_id).then(function(a) {
            e.plan = a.data, j.plan = e.plan, e.metric = _.find(e.plan.metrics, {
                name: e.metric_name
            }) || e.metric, j.setMetricCopy(), j.setDropdown(), d.closeLoadingSpinner();
        }, function(a) {
            e.plan = {}, d.closeLoadingSpinner();
            var c = b.instant("ResourceProvider_ErrorBox_GetPlan_XMSG", {
                planId: e.planId,
                statusText: a.statusText
            });
            h.openErrorBox(c);
        });
    }, j.setDropdown = function() {
        e.planId = f.plan_id, e.instance_id = f.instance_id, e.binding_id = f.binding_id, 
        e.metric_name = f.metric_name, e.dropdown = d.getMetricsDropdown(e.plan, e.metric_name, e);
    }, j.setFlags = function() {
        e.isReadOnly = !d.getMetricCreateMode(), e.isCreateMetricMode = !d.getMetricCreateMode();
    }, j.onLoad = function(a) {
        a.setShowPrintMargin(!1), e.editor = a, e.editor.setOptions({
            minLines: 10,
            wrap: !0,
            firstLineNumber: 1,
            enableBasicAutocompletion: !0,
            enableSnippets: !0,
            enableLiveAutocompletion: !0
        });
    }, j.onEditMetricClick = function() {
        j.setPlanCopy(), j.resetReadOnly();
    }, j.setPlanCopy = function() {
        e.planCopy = angular.copy(e.plan);
    }, j.navigateBackToMetering = function() {
        if (d.getMetricCreateMode()) g.path(g.$$path.substr(0, g.$$path.lastIndexOf("/"))), 
        d.resetMetricCreateMode(); else {
            var a = g.$$path.substr(0, g.$$path.lastIndexOf("/"));
            g.path(a.substr(0, a.lastIndexOf("/")));
        }
    }, j.onCancelMetricClick = function() {
        e.metricsCtrl.metricform.$setPristine(), d.getMetricCreateMode() ? (j.setFlags(), 
        j.navigateBackToMetering()) : (j.setReadOnly(), e.metric = j.getMetricCopy(), e.paneChanged());
    }, j.onDeleteMetricClick = function(a) {
        var a = e.metric, c = b.instant("ResourceProvider_Metric_DeleteAction_Box_XTIT"), d = b.instant("ResourceProvider_Metric_DeleteAction_Box_XMSG", {
            metricName: a.name
        });
        e.messageBoxInstance = h.openMessageBox(c, d), e.messageBoxInstance.result.then(function() {
            j.onDeleteMetricConfirm(a);
        });
    }, j.onDeleteMetricConfirm = function() {
        var a = angular.copy(e.plan), c = angular.copy(e.metric);
        _.remove(a.metrics, {
            name: c.name
        }), d.openLoadingSpinner(), d.updateMeteringPlan(a.plan_id, a).then(function() {
            j.setReadOnly(), d.closeLoadingSpinner(), j.navigateBackToMetering();
        }, function(a) {
            j.setReadOnly(), d.closeLoadingSpinner();
            var e = b.instant("ResourceProvider_ErrorBox_DeleteMetric_XMSG", {
                metricName: c.name,
                statusText: a.statusText
            });
            h.openErrorBox(e);
        });
    }, j.onAddMetricConfirm = function() {
        var a = angular.copy(e.plan), c = angular.copy(e.metric), c = angular.copy(e.metric);
        a.metrics.push(c), d.openLoadingSpinner(), d.updateAllPlans(a.plan_id, e.metric.name, a).then(function() {
            d.closeLoadingSpinner(), j.navigateBackToMetering();
        }, function(a) {
            d.closeLoadingSpinner(), j.navigateBackToMetering();
            var e = b.instant("ResourceProvider_ErrorBox_AddMetric_XMSG", {
                metrcName: c.name,
                statusText: a.statusText
            });
            h.openErrorBox(e);
        });
    }, j.onUpdateMetricConfirm = function() {
        var a = angular.copy(e.plan), c = angular.copy(e.metric);
        metricCopy = _.omitBy(c, _.isEmpty);
        var f = _.findIndex(e.plan.metrics, {
            name: e.metricCopy.name
        });
        a.metrics[f] = c;
        var g = null;
        g = c.name === j.getMetricCopy().name ? d.updateMeteringPlan(a.plan_id, a) : d.updateAllPlans(a.plan_id, c.name, a), 
        g.then(function() {
            j.setReadOnly(), e.metric_name = c.name, e.plan = a, e.dropdown = d.getMetricsDropdown(e.plan, e.metric_name, e), 
            j.setMetricCopy(), d.closeLoadingSpinner();
        }, function(a) {
            j.setReadOnly(), e.metric = j.getMetricCopy(), e.plan = e.planCopy, e.paneChanged(), 
            d.closeLoadingSpinner();
            var c = b.instant("ResourceProvider_ErrorBox_UpdateMetric_XMSG", {
                metricName: metricCopy.name,
                statusText: a.statusText
            });
            h.openErrorBox(c);
        });
    }, j.onSaveMetricClick = function() {
        e.metricsCtrl.metricform.$setPristine(), d.openLoadingSpinner(), d.getMetricCreateMode() ? j.onAddMetricConfirm() : j.onUpdateMetricConfirm();
    }, j.setReadOnly = function() {
        e.isReadOnly = !0;
    }, j.resetReadOnly = function() {
        e.isReadOnly = !1;
    }, e.paneChanged = function(a) {
        var b = null;
        if (a ? (e.selectedPane = a, b = a) : b = e.selectedPane, "Details" === b.title) e.showAceEditor = !1; else {
            if (e.plan && e.plan.metrics) {
                var c = e.metric[b.title.toLowerCase()];
                e.editor.getSession().setValue(c || "");
            }
            e.showAceEditor = !0;
        }
    }, j.onChange = function(a) {
        _.isMatch(e.metricCopy, e.metric) ? e.metricsCtrl.metricform.$setPristine() : e.metricsCtrl.metricform.$setDirty();
        var b = e.editor.getSession().getValue(), c = e.selectedPane.title.toLowerCase();
        "details" !== c && (e.metric[c] = b);
    }, e.tabChanged = function(a) {
        e.selectedTab = a;
    }, j.setMetricCopy = function() {
        e.metricCopy = angular.copy(e.metric);
    }, j.getMetricCopy = function() {
        return angular.copy(e.metricCopy);
    }, j.initController();
} ]).directive("tabs", function() {
    return {
        restrict: "E",
        transclude: !0,
        scope: {
            paneChanged: "&"
        },
        controller: [ "$scope", "$element", function(a, b) {
            var c = a.panes = [], d = null;
            a.isSelected = function(b) {
                var c = a.$parent.selectedPane;
                return c ? c.title === b.title ? (b.selected = !0, !0) : (b.selected = !1, !1) : b.selected;
            }, a.select = function(b) {
                b.selected = !0, a.selectedPane = b, a.paneChanged({
                    selectedPane: b
                });
            }, this.addPane = function(a) {
                0 != c.length || d ? a.selected = !1 : a.selected = !0, c.push(a);
            };
        } ],
        template: '<div class="tabbable"><ul class="nav nav-tabs tabs-advanced"><li ng-repeat="pane in panes" ng-class="{active:isSelected(pane)}"><a href="" ng-click="select(pane)">{{pane.title}}</a></li></ul><div class="tab-content" ng-transclude></div></div>',
        replace: !0
    };
}).directive("pane", function() {
    return {
        require: "^tabs",
        restrict: "E",
        transclude: !0,
        scope: {
            title: "@"
        },
        link: function(a, b, c, d) {
            d.addPane(a);
        },
        template: '<div class="tab-pane" ng-class="{active: selected}" ng-transclude></div>',
        replace: !0
    };
}), angular.module("MessageBoxService", []).factory("MessageBox", [ "$uibModal", "$rootScope", function(a, b) {
    var c = {};
    return c.openMessageBox = function(c, d) {
        var e = function(a, b) {
            a.message = d, a.messageBoxTitle = c, a.onOk = function() {
                b.close();
            }, a.onClose = function() {
                b.dismiss("cancel");
            };
        };
        return e.$inject = [ "$scope", "$uibModalInstance" ], a.open({
            templateUrl: "components/partials/MessageBox.html",
            controller: e,
            scope: b
        });
    }, c.openErrorBox = function(b) {
        var c = function(a, c) {
            a.message = b, a.onOk = function() {
                c.dismiss("cancel");
            };
        };
        c.$inject = [ "$scope", "$uibModalInstance" ], a.open({
            templateUrl: "components/partials/ErrorBox.html",
            controller: c
        });
    }, c;
} ]), angular.module("ResourceProviderService", []).factory("ResourceProviderFactory", [ "$http", "$rootScope", "$compile", "$interpolate", function(a, b, c, d) {
    return ResourceProviderFactory = {}, ResourceProviderFactory.isMetricEditMode = !1, 
    ResourceProviderFactory.defaultMeteringPane = "measures", ResourceProviderFactory.getMeteringPlan = function(b) {
        return a.get("v1/metering/plans/" + b);
    }, ResourceProviderFactory.updateMeteringPlan = function(b, c, d) {
        return a.put("v1/metering/plans/" + b, c);
    }, ResourceProviderFactory.updateAllPlans = function(b, c, d, e) {
        return a.put("v1/plans/" + b + "/metrics/" + c, d);
    }, ResourceProviderFactory.getSampleUsageDocument = function(b) {
        return a.get("v1/metering/usage_doc/" + b);
    }, ResourceProviderFactory.pushSampleUsageDocument = function(b) {
        return a.post("v1/collector/usage_doc", b);
    }, ResourceProviderFactory.openLoadingSpinner = function(a) {
        b.isLoadingSpinnerActive = !0;
    }, ResourceProviderFactory.setMetricCreateMode = function(a) {
        ResourceProviderFactory.isMetricCreateMode = !0;
    }, ResourceProviderFactory.getMetricCreateMode = function(a) {
        return ResourceProviderFactory.isMetricCreateMode;
    }, ResourceProviderFactory.resetMetricCreateMode = function(a) {
        ResourceProviderFactory.isMetricCreateMode = !1;
    }, ResourceProviderFactory.closeLoadingSpinner = function() {
        b.isLoadingSpinnerActive = !1;
    }, ResourceProviderFactory.constructErrorMessage = function(a, b, c) {
        return ResourceProviderFactory.getMessage(a) + ' "' + b + '" : ' + c + ".";
    }, ResourceProviderFactory.getMessage = function(a) {
        return b.messagebundle[a];
    }, ResourceProviderFactory.getPlan = function() {
        return ResourceProviderFactory.plan;
    }, ResourceProviderFactory.getMetricsDropdown = function(a, b, c) {
        for (var d = a.plan_id, e = c.binding_id, f = c.instance_id, g = _.sortBy(a.metrics, [ function(a) {
            return a.name;
        } ]), h = "", i = 0; i < g.length; i++) {
            var j = g[i].name, k = angular.equals(b, j), l = k ? "showIcon" : "hideIcon";
            h += '<li><a href="/manage/instances/' + f + "/bindings/" + e + "/metering/" + d + "/metrics/" + j + '"><span>' + j + '</span><i style="margin-left:15px" class="glyphicon glyphicon-ok clickable ' + l + '"', 
            h += "></i></a></li>";
        }
        return h;
    }, ResourceProviderFactory.getSampleFunctions = function() {
        return a.get("/components/templates.json");
    }, ResourceProviderFactory;
} ]), angular.module("Resource-Provider.userProfile").controller("themeController", [ "$uibModal", "themeService", function(a, b) {
    var c = this;
    c.windowReload = function(a) {
        a.location.reload();
    }, c.showModalDialog = function() {
        var b = a.open({
            templateUrl: "components/userProfile/templates/themeModalTemplate.html",
            controller: "themeModalController",
            controllerAs: "TMC"
        });
        b.result.then(function() {
            c.windowReload(window);
        });
    };
} ]), angular.module("Resource-Provider.userProfile").controller("themeModalController", [ "$uibModalInstance", "$scope", "themeService", "MessageBox", function(a, b, c, d) {
    var e = this;
    e.title = "Select Themes", e.type = "selTheme", e.messageBundle = b.$resolve.messageBundle, 
    e.availableUploadedThemes = [], e.selectedUploadedTheme = "", e.isDisable = !0, 
    e.themePreference = "";
    var f = b.$parent.uploadThemeFeatureFlag;
    e.uploadFeatureFlag = "true" == f, e.selectedThemeChange = function(a) {
        e.isDisable = !1, e.selectedUploadedTheme = a.filename, e.themePreference = a.displayname, 
        e.themeType = a.themeType;
    }, e.onSave = function() {
        c.toggleLoadingIcon(e), c.saveUserPreference({
            themePreference: e.selectedUploadedTheme
        }, e.themeType).then(function(b) {
            c.toggleLoadingIcon(e), a.close();
        }, function(a, b) {
            c.toggleLoadingIcon(e);
        });
    }, e.onClose = function() {
        a.dismiss("cancel");
    }, e.uploadFile = function(a) {
        e.isDisable = !1, c.toggleLoadingIcon(e);
        var b = e.customThemeFile;
        c.uploadFileToDB(b).then(function(b) {
            c.toggleLoadingIcon(e), a && (e.selectedUploadedTheme = e.upFileName, e.onSave()), 
            e.upFileName = "No file chosen";
        }, function(a, b) {
            c.toggleLoadingIcon(e), d.openErrorBox(a.data), console.log(a);
        });
    }, e.populateUploadedTheme = function() {
        c.toggleLoadingIcon(e), c.getUploadedThemes().then(function(a) {
            for (var b = a.data, d = 0; d < b.length; d++) b[d].displayname || (b[d].displayname = b[d].filename.split(".css")[0]);
            e.availableUploadedThemes = b, c.toggleLoadingIcon(e);
        }, function(a, b) {
            c.toggleLoadingIcon(e);
        });
    }, e.getThemePreference = function() {
        c.getThemePreference().then(function(a) {
            _.isUndefined(a) || (e.themePreference = a.data);
        }, function(a, b) {
            c.toggleLoadingIcon(e);
        });
    }, e.getThemePreference(), e.populateUploadedTheme(), e.isItemSelected = function(a) {
        if ("" === e.themePreference) return !1;
        for (var b, c = 0; c < e.availableUploadedThemes.length; c++) if (b = e.availableUploadedThemes[c], 
        "undefined" != typeof b && b.displayname.toUpperCase() === e.themePreference.toUpperCase() && b.displayname.toUpperCase() === a.displayname.toUpperCase()) return !0;
        return !1;
    };
} ]), angular.module("Resource-Provider.userProfile").controller("userProfileController", [ "userProfileService", "$scope", function(a, b) {
    var c = this;
    c.userProfile = {}, a.getUserProfile().then(function(a) {
        c.userProfile.email = _.isUndefined(a) ? [] : a.data.email;
    }, function(a, b) {
        console.log(a);
    }), a.getUploadFeatureFlag().then(function(a) {
        var c = "" !== a.data && a.data;
        b.$root.uploadThemeFeatureFlag = c;
    }, function(a, b) {
        console.log(a);
    });
} ]), angular.module("Resource-Provider.userProfile").directive("fileModel", [ "$parse", function(a) {
    return {
        restrict: "A",
        link: function(b, c, d) {
            var e = a(d.fileModel), f = e.assign;
            b.$parent.TMC.upFileName = "No file chosen", c.bind("change", function() {
                b.$apply(function() {
                    b.$parent.TMC.upFileName = c[0].files[0].name, f(b, c[0].files[0]);
                });
            });
        }
    };
} ]), angular.module("Resource-Provider.userProfile").directive("userProfile", function() {
    return {
        templateUrl: "/components/userProfile/templates/userProfileTemplate.html",
        restrict: "E",
        controller: "userProfileController",
        controllerAs: "UPC",
        bindToController: !0,
        scope: {},
        link: function(a, b, c) {}
    };
}), angular.module("Resource-Provider.userProfile").service("themeService", [ "$http", function(a) {
    this.getmessageBundle = function() {
        return a.get("/components/userProfile/resources/messageBundle.json");
    }, this.uploadFileToDB = function(b) {
        var c = new FormData();
        return c.append("file", b), a.post("/userProfile/cssUpload", c, {
            transformRequest: angular.identity,
            headers: {
                "Content-Type": void 0
            }
        });
    }, this.getUploadedThemes = function() {
        return a.get("/userProfile/getThemeMetadata");
    }, this.saveUserPreference = function(b, c) {
        if ("defaultTheme" === c) return a.delete("/userProfile/removePrefAndLoadPreDefTheme");
        var d;
        return d = c ? _.assign(b, {
            themeType: c
        }) : _.assign(b, {
            themeType: "custom"
        }), a.put("/userProfile/saveThemePreference", JSON.stringify(d));
    }, this.toggleLoadingIcon = function(a) {
        a.isLoadingSpinnerActive = !a.isLoadingSpinnerActive;
    }, this.getThemePreference = function() {
        return a.get("/userProfile/getThemePreference");
    };
} ]), angular.module("Resource-Provider.userProfile").service("userProfileService", [ "$http", function(a) {
    this.getUserProfile = function() {
        return a.get("/userProfile/getUser");
    }, this.getUploadFeatureFlag = function() {
        return a.get("/userProfile/getThemeUploadFeatureFlag");
    };
} ]);