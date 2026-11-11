FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json server.mjs ./
COPY src ./src
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/data DEMO=false
EXPOSE 3070
CMD ["node", "server.mjs"]
