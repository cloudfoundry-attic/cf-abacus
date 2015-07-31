'use strict';

module.exports = () => ({
    'title': 'Service Instance Usage',
    'description': 'Usage records for a service instance',
    'type': 'object',
    'required': ['service_id', 'usage'],
    'properties': {
        'service_id': {
            'type': 'string'
        },
        'usage': {
            'type': 'array',
            'minItems': 1,
            'items': {
                'type': 'object',
                'required': ['start', 'end', 'plan_id', 'organization_guid', 'space_guid', 'resources'],
                'properties': {
                        'start': {
                            'type': 'integer',
                            'format': 'utc-millisec'
                        },
                        'end': {
                            'type': 'integer',
                            'format': 'utc-millisec'
                        },
                        'plan_id': {
                            'type': 'string'
                        },
                        'region': {
                            'type': 'string'
                        },
                        'organization_guid': {
                            'type': 'string'
                        },
                        'space_guid': {
                            'type': 'string'
                        },
                        'consumer': {
                            'type': 'object',
                            'required': ['type', 'value'],
                            'properties': {
                                'type': {
                                    'enum': ['cloud_foundry_application', 'external'],
                                    'default': 'cloud_foundry_application'
                                },
                                'value': {
                                    'type': 'string'
                                }
                            },
                            'additionalProperties': false
                        },
                        'resources': {
                            'type': 'array',
                            'minItems': 1,
                            'items': {
                                'type': 'object',
                                'required': ['unit', 'quantity'],
                                'properties': {
                                    'name': {
                                        'type': 'string'
                                    },
                                    'unit': {
                                        'type': 'string'
                                    },
                                    'quantity': {
                                        'type': 'number'
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
        'additionalProperties': false
    }
});

