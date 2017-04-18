FROM node:6.10.2
RUN apt-get update -y
RUN apt-get install -y mongodb zip
RUN apt-get clean

WORKDIR /usr/bin
RUN curl -L "https://cli.run.pivotal.io/stable?release=linux64-binary&source=github" | tar -zx

ENV NPM_CONFIG_LOGLEVEL=warn