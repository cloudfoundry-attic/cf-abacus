FROM node:8.9.4

RUN apt-get update -y
RUN apt-get install -y zip
RUN apt-get clean

ENV NPM_CONFIG_LOGLEVEL=warn

RUN mkdir -p ~/workspace
WORKDIR ~/workspace
RUN git clone --depth 1 --recurse-submodules https://github.com/cloudfoundry-incubator/cf-abacus.git

WORKDIR cf-abacus
RUN yarn run provision
CMD yarn run start && sleep infinity

# PouchDB
EXPOSE 5984
# Collector
EXPOSE 9080
# reporting
EXPOSE 9088
# meter
EXPOSE 9100
# accumulator
EXPOSE 9200
# aggregator
EXPOSE 9300
# cf-applications
EXPOSE 9500
# cf-renewer
EXPOSE 9501
# cf-services
EXPOSE 9502
# provisioning-plugin
EXPOSE 9880
# account-plugin
EXPOSE 9881
# authserver-plugin
EXPOSE 9882
# eureka-plugin
EXPOSE 9990
