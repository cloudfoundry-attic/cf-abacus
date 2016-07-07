FROM node:6.2.0

RUN echo "deb http://packages.erlang-solutions.com/debian jessie contrib" > /etc/apt/sources.list.d/erlang-solutions.list
RUN wget -qO - http://packages.erlang-solutions.com/debian/erlang_solutions.asc | apt-key add -
RUN apt-get update -y
RUN apt-get install -y build-essential curl libmozjs185-1.0 libmozjs185-dev libcurl4-openssl-dev libicu-dev wget curl
RUN apt-get install -y erlang-dev=1:17.5.3 erlang-base=1:17.5.3 erlang-crypto=1:17.5.3 \
                        erlang-nox=1:17.5.3 erlang-inviso=1:17.5.3 erlang-runtime-tools=1:17.5.3 \
                        erlang-inets=1:17.5.3 erlang-edoc=1:17.5.3 erlang-syntax-tools=1:17.5.3 \
                        erlang-xmerl=1:17.5.3 erlang-corba=1:17.5.3 erlang-mnesia=1:17.5.3 \
                        erlang-os-mon=1:17.5.3 erlang-snmp=1:17.5.3 erlang-ssl=1:17.5.3 \
                        erlang-public-key=1:17.5.3 erlang-asn1=1:17.5.3 erlang-ssh=1:17.5.3 \
                        erlang-erl-docgen=1:17.5.3 erlang-percept=1:17.5.3 erlang-diameter=1:17.5.3 \
                        erlang-webtool=1:17.5.3 erlang-eldap=1:17.5.3 erlang-tools=1:17.5.3 \
                        erlang-eunit=1:17.5.3 erlang-ic=1:17.5.3 erlang-odbc=1:17.5.3 \
                        erlang-parsetools=1:17.5.3
RUN apt-get install -y zip

RUN useradd -d /var/lib/couchdb couchdb
RUN mkdir -p /usr/local/{lib,etc}/couchdb /usr/local/var/{lib,log,run}/couchdb /var/lib/couchdb
RUN chown -R couchdb:couchdb /usr/local/{lib,etc}/couchdb /usr/local/var/{lib,log,run}/couchdb
RUN chmod -R g+rw /usr/local/{lib,etc}/couchdb /usr/local/var/{lib,log,run}/couchdb

RUN wget -O apache-couchdb.tar.gz https://archive.apache.org/dist/couchdb/source/1.6.1/apache-couchdb-1.6.1.tar.gz
RUN tar xzf apache-couchdb.tar.gz
RUN rm -f apache-couchdb.tar.gz
RUN cd apache-couchdb-* && ./configure --prefix=/usr/local --with-js-lib=/usr/lib --with-js-include=/usr/include/mozjs --enable-init
RUN cd apache-couchdb-* && make && make install

RUN chown couchdb:couchdb /usr/local/etc/couchdb/local.ini
RUN ln -s /usr/local/etc/init.d/couchdb /etc/init.d/couchdb
RUN ln -s /usr/local/etc/couchdb /etc
RUN /etc/init.d/couchdb start

RUN cd /usr/bin && curl -L "https://cli.run.pivotal.io/stable?release=linux64-binary&source=github" | tar -zx

ENV NPM_CONFIG_LOGLEVEL=warn