FROM ubuntu:14.04.4
RUN apt-get update -y
RUN apt-get -y install curl build-essential ruby-dev dnsutils
RUN apt-get clean

RUN cd /usr/bin && curl -L "https://cli.run.pivotal.io/stable?release=linux64-binary&source=github" | tar -zx
RUN gem install cf-uaac
