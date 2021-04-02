FROM node:15-alpine as builder


WORKDIR /app
COPY package*.json ./
RUN npm ci --quiet
COPY tsconfig.json ./
COPY ./src ./src
COPY ./npm_publish/custom_publish.js node_modules/npm/lib/publish.js
RUN npm run build

FROM node:15-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV REGISTRY="CHANGE_ME"
ENV LISTEN_PACKAGES_DIRECTORY="CHANGE_ME"
ENV BACKUP_DIRECTORY="CHANGE_ME"
ENV ERROR_DIRECTORY="CHANGE_ME"
ENV VERDACCIO_CONF_FILEPATH="CHANGE_ME"

RUN npm i -g npm
COPY package*.json ./
RUN npm ci --quiet --only=production

COPY --from=builder /app/dist ./dist
COPY ./npm_publish/publish.js node_modules/npm/lib/publish.js
COPY . .


CMD npm run serve



