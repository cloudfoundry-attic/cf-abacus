'use strict';

/**
 * Create UI with UI5
 */
sap.ui.getCore().attachInit(function() {

  // ---------------------------------------------------------------------------
  // Create table that shows aggregated metrics parsed from Abacus report result
  // ---------------------------------------------------------------------------
  const oUsageReportAggregatesModel = new sap.ui.model.json.JSONModel();
  const usageModelData = [
    { 'measure': 'sampleName', 'quantity': 250 }
  ];
  let usageReportAggregatesData = [
    { 'metric': 'sampleName', 'quantity': 'unknown' }
  ];

  // ---------------------------------------------------------------------------
  // Create a text area that we will use to output results of triggered actions
  // ---------------------------------------------------------------------------

  const area = new sap.m.TextArea('idTextArea', {
    rows: 20,
    cols: 140,
    editable: false,
    placeholder: 'Click on either of the tiles to perform an action.'
  });

  // ---------------------------------------------------------------------------
  // Create tiles that can be used to trigger actions
  // ---------------------------------------------------------------------------

  // Tile for sending usage data to Abacus via the backend
  const sendPost = new sap.m.StandardTile({
    title: '1. Create and send usage document to Abacus',
    icon: 'sap-icon://action',
    number: 1,
    press: function() {
      area.setValue('Sending usage data to Abacus via backend...');

      $.ajax({
        type: 'POST',
        url: '/sendusage',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(usageModelData),
        success: function(data, textStatus, jqXHR) {
          console.log('POST to backend: Success');
          area.setValue('Abacus return code: ' + data[0] +
            '\n\nUsage document sent to Abacus:\n' +
            JSON.stringify(data[1], null, 2));
        },
        error: function(jqXHR, textStatus, errorThrown) {
          console.log('POST to backend: Error ' + textStatus +
            ' - ' + errorThrown);
        }
      });
    }
  });
  sendPost.addStyleClass('customTileFontStyle');

  // Tile for receiving usage report data from Abacus via the backend
  const sendGet = new sap.m.StandardTile({
    title: '2. Get Consumption Report from Abacus',
    icon: 'sap-icon://cause',
    number: 2,
    press: function() {
      area.setValue('Requesting usage report for organization from Abacus ' +
        'via backend...');

      $.ajax({
        type: 'GET',
        contentType: 'application/json',
        url: '/getusage',
        dataType: 'json',
        success: function(data, textStatus, jqXHR) {
          console.log('GET from backend: Success');
          area.setValue('Abacus return code: ' + data[0] +
            '\n\nAggregated monthly usage for whole organization:\n' +
            JSON.stringify(data[1], null, 2) +
            '\n\nRaw response from Abacus:\n' +
            JSON.stringify(data[2], null, 2));
          usageReportAggregatesData = data[1];
          oUsageReportAggregatesModel.setData(usageReportAggregatesData);
        },
        error: function(jqXHR, textStatus, errorThrown) {
          console.log('GET from backend: Error ' + textStatus +
            ' - ' + errorThrown);
        }
      });
    }
  });
  sendGet.addStyleClass('customTileFontStyle');

  // ---------------------------------------------------------------------------
  // Create table that shows the usage data to be passed to Abacus
  // ---------------------------------------------------------------------------
  const oUsageModel = new sap.ui.model.json.JSONModel();
  oUsageModel.setData(usageModelData);

  // Instantiate the table
  const oTableUsage = new sap.ui.table.Table({
    title: 'Usage Data to send',
    selectionMode: sap.ui.table.SelectionMode.Single,
    visibleRowCount: 3
  });

  // Define the Table columns and the binding values
  oTableUsage.addColumn(new sap.ui.table.Column({
    label: new sap.ui.commons.Label({ text: 'Measure' }),
    template: new sap.ui.commons.TextView({ text: '{measure}' })
  }));

  oTableUsage.addColumn(new sap.ui.table.Column({
    label: new sap.ui.commons.Label({ text: 'Quantity' }),
    template: new sap.ui.commons.TextField({ value: '{quantity}' })
  }));

  oTableUsage.setModel(oUsageModel);
  oTableUsage.bindRows('/');

  // ---------------------------------------------------------------------------
  // Create table that shows the data passed by the backend
  // (AppId, SpaceId, OrgId)
  // ---------------------------------------------------------------------------
  const oDetailsModel = new sap.ui.model.json.JSONModel();
  oDetailsModel.setData(detailsModelData);

  // Instantiate the table
  const oTable = new sap.ui.table.Table({
    title: 'App Details from CF Runtime',
    selectionMode: sap.ui.table.SelectionMode.Single,
    visibleRowCount: 3
  });

  // Define the Table columns and the binding values
  oTable.addColumn(new sap.ui.table.Column({
    label: new sap.ui.commons.Label({ text: 'Name' }),
    template: new sap.ui.commons.TextView({ text: '{key}' })
  }));

  oTable.addColumn(new sap.ui.table.Column({
    label: new sap.ui.commons.Label({ text: 'Value' }),
    template: new sap.ui.commons.TextField({
      value: '{value}',
      editable: false
    })
  }));

  oTable.setEditable(false);
  oTable.setModel(oDetailsModel);
  oTable.bindRows('/');
  oUsageReportAggregatesModel.setData(usageReportAggregatesData);

  // Instantiate the table
  const oTableAggregatedUsage = new sap.ui.table.Table({
    title: 'Monthly Aggregates for Organization',
    selectionMode: sap.ui.table.SelectionMode.Single,
    visibleRowCount: 3
  });

  // Define the Table columns and the binding values
  oTableAggregatedUsage.addColumn(new sap.ui.table.Column({
    label: new sap.ui.commons.Label({ text: 'Metric' }),
    template: new sap.ui.commons.TextView({ text: '{metric}' })
  }));

  oTableAggregatedUsage.addColumn(new sap.ui.table.Column({
    label: new sap.ui.commons.Label({ text: 'Quantity' }),
    template: new sap.ui.commons.TextField({ value: '{quantity}' })
  }));

  oTableAggregatedUsage.setEditable(false);
  oTableAggregatedUsage.setModel(oUsageReportAggregatesModel);
  oTableAggregatedUsage.bindRows('/');

  // ---------------------------------------------------------------------------
  // Assemble layout and elements to show in UI
  // ---------------------------------------------------------------------------

  // Box as container for upper part of the UI showing the tables with info
  const box1 = new sap.m.FlexBox({
    width: '100%',
    alignContent: sap.m.FlexAlignContent.Center,
    justifyContent: sap.m.FlexJustifyContent.Center,
    items: [oTableUsage, oTable, oTableAggregatedUsage]
  });

  // Box as container for middle part of the screen containing the tiles for
  // the sending and receiving action
  const box = new sap.m.FlexBox({
    width: '100%',
    alignContent: sap.m.FlexAlignContent.Center,
    justifyContent: sap.m.FlexJustifyContent.Center,
    items: [sendPost, sendGet]
  });

  // Box as container for lower part of the screen with message box showing
  // results of performed actions
  const box2 = new sap.m.FlexBox({
    height: '50%',
    width: '100%',
    alignContent: sap.m.FlexAlignContent.Center,
    justifyContent: sap.m.FlexJustifyContent.Center,
    items: [area]
  });

  // Create simple breakline to separate sections in the UI
  const breakline = new sap.m.Text({
    text: '\n'
  });

  // Create the first page containing all the boxes we defined
  const page1 = new sap.m.Page('page1', {
    title: 'Metering on Cloud Foundry - Simple Demo',
    showNavButton: false,
    content: [box1, box, breakline, box2]
  });

  // Create simple app that initially just shows page1
  const app = new sap.m.App('myApp', {
    initialPage: 'page1'
  });

  // Add page to the app
  app.addPage(page1);

  // Place the app into the HTML document
  app.placeAt('content');

});
