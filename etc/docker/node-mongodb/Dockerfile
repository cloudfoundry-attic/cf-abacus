FROM node:8.12.0

RUN apt-get update -y
RUN apt-get install -y mongodb zip
RUN apt-get clean

WORKDIR /usr/bin
RUN curl -L "https://cli.run.pivotal.io/stable?release=linux64-binary&source=github" | tar -zx

ENV NPM_CONFIG_LOGLEVEL=warn
RUN npm install -g npm@4
