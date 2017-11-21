#!/bin/sh

pouch=5984
collector=9080
reporting=9088
meter=9100
accumulator=9200
aggregator=9300
cf_applications=9500
cf_renewer=9501
cf_services=9502
provisioning_plugin=9880
account_plugin=9881
authserver_plugin=9882
eureka_plugin=9990

docker run -p $pouch -p $collector -p $reporting abacus-localdev
