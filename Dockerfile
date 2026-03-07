#FROM ghcr.io/puppeteer/puppeteer:22.6.2
FROM node:20.12

ARG ENV=prod

ENV ENV=$ENV

RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] https://dl-ssl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-khmeros fonts-kacst fonts-freefont-ttf fonts-noto-color-emoji libxss1 dbus dbus-x11 \
      --no-install-recommends 

#COPY dist /root/dist
COPY views /root/views
COPY export /root/export
COPY assets /root/assets
COPY veogen /root/veogen
COPY *.sh /root/
COPY *.json /root/
#COPY *.lock /root/
COPY *.js /root/

# Just an empty file, we don't use it in Docker
RUN touch /root/veogen/modules/vertex-api-key.txt

WORKDIR /root
RUN yarn install --production

EXPOSE 7534/tcp
ENTRYPOINT ./start-prod.sh