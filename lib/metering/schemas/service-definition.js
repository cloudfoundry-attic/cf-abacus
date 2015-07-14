'use strict';

module.exports = () => ({
    'title': 'Service Resource Definition',
    'description': 'Defines the resources, units, metering, aggregation and rating formulas used to meter a particular service',
    'type': 'object',
    'required': ['id', 'resources', 'aggregations'],
    'properties': {
        'id': {
            'type': 'string'
        },
        'resources': {
            'type': 'array',
            'minItems': 1,
            'items': {
                'type': 'object',
                'required': ['units'],
                'properties': {
                    'name': {
                        'type': 'string'
                    },
                    'units' : {
                        'type': 'array',
                        'minItems': 1,
                        'items': {
                            'type': 'object',
                            'required': ['name', 'quantityType'],
                            'properties': {
                                'name': {
                                    'type': 'string'
                                },
                                'quantityType': {
                                    'enum' : [ 'DELTA', 'CURRENT']
                                }
                            },
                            'additionalProperties': false
                        },
                        'additionalItems': false
                    }
                },
                'additionalProperties': false
            },
            'additionalItems': false
        },
        'aggregations': {
            'type': 'array',
            'items': {
                'type': 'object',
                'required': ['id', 'unit', 'formula'],
                'properties': {
                    'id': {
                      'type': 'string'
                    },
                    'unit': {
                        'type': 'string'
                    },
                    'aggregationGroup': {
                        'type': 'object',
                        'required': ['name'],
                        'properties': {
                            'name': {
                                'enum': ['daily', 'monthly']
                            },
                            'additionalProperties': false
                        }
                    },
                    'formula': {
                    },
                    'accumulate': {
                    },
                    'aggregate': {
                    },
                    'rate': {
                    }
                },
                'additionalProperties': false
            },
            'additionalItems': false
        }
    },
    'additionalProperties':  false
});

