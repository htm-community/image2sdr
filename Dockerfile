FROM node:8.11.4
MAINTAINER Paul Lamb "paul@paulscode.com"

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY . /usr/src/app

RUN npm install --production

EXPOSE 80
CMD [ "npm", "start" ]
