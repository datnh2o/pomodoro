####
FROM node:22-alpine3.18

#sudo chown -R ${USER} .nuxt

RUN mkdir -p /var/www/pomodoro
WORKDIR /var/www/pomodoro

# Copy existing application directory contents
COPY . /var/www/pomodoro

# Install all dependencies
RUN npm install

# build necessary, even if no static files are needed,
# since it builds the server as well
RUN npm run build

EXPOSE 3030

ENV NUXT_HOST=0.0.0.0

ENV NUXT_PORT=3030

CMD [ "npm", "run", "dev" ]
