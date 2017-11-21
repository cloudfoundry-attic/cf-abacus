FROM ubuntu:14.04

RUN apt-get update -y
RUN apt-get -y install software-properties-common

RUN apt-add-repository ppa:brightbox/ruby-ng
RUN apt-get update -y

RUN apt-get -y install curl build-essential ruby2.3 ruby2.3-dev dnsutils jq
RUN apt-get clean

RUN gem install cf-uaac --no-ri --no-rdoc

WORKDIR /usr/bin
RUN curl -L "https://cli.run.pivotal.io/stable?release=linux64-binary&source=github" | tar -zx
