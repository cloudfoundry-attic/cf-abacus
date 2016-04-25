FROM ubuntu:14.04.4
RUN apt-get update -y
RUN apt-get -y install curl
RUN apt-get clean
RUN cd /bin && curl -L "https://cli.run.pivotal.io/stable?release=linux64-binary&source=github" | tar -zx
