FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/database
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/database"]
CMD ["npm", "start"]
