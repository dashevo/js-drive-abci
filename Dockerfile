FROM 103738324493.dkr.ecr.us-west-2.amazonaws.com/dashevo/v13-node-base:latest

LABEL maintainer="Dash Developers <dev@dash.org>"
LABEL description="DashDrive Node.JS"

RUN apk update && \
    apk --no-cache upgrade && \
    apk add --no-cache bash \
                       git \
                       openssh-client \
                       python \
                       alpine-sdk \
                       zeromq-dev

# Install dependencies first, in a different location
# for easier app bind mounting for local development
WORKDIR /

# Save NPM_TOKEN for allowing access to private npm organization
ARG NPM_TOKEN
ENV NPM_TOKEN ${NPM_TOKEN}
RUN echo "//registry.npmjs.org/:_authToken=\${NPM_TOKEN}" > .npmrc

# Install packages
COPY package.json package-lock.json ./
ENV npm_config_zmq_external=true
RUN npm install
ENV PATH /node_modules/.bin:$PATH

# Copy project files
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN mv .env.example .env

ARG NODE_ENV=production
ENV NODE_ENV ${NODE_ENV}

EXPOSE 80 9229

CMD node
