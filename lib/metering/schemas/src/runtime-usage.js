'use strict';

module.exports = () => ({
    'title': 'Runtime Usage',
    'description': 'Usage records for a runtime',
    'type': 'object',
    'required': ['usage'],
    'properties': {
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
                            'required': ['value'],
                            'properties': {
                                'type': {
                                    'enum': ['cloud_foundry_application'],
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

