# CAPE Refund Desk. Build for the Nebius Serverless AI endpoint (linux/amd64, port 8080):
#   docker buildx build --platform linux/amd64 -t cape-refund-desk .
# The image carries NO secrets. NEBIUS_API_KEY and TAVILY_API_KEY are runtime env / platform secrets only.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin app && chown -R app /app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
