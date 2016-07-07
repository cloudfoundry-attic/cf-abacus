FROM node:6.2.0
RUN apt-get update -y
RUN apt-get install -y mongodb zip
RUN apt-get clean

RUN cd /usr/bin && curl -L "https://cli.run.pivotal.io/stable?release=linux64-binary&source=github" | tar -zx

ENV NPM_CONFIG_LOGLEVEL=warn