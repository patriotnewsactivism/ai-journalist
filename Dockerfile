# AI Journalist Studio — Next.js 14 (pages router), Contabo deployment.
# `next build` compiles TypeScript and Tailwind, so the build stage NEEDS devDependencies.
# Installing with `npm ci --omit=dev` in the builder is what made lucide-react look "untyped"
# and forced hand-written .d.ts shims — do not reintroduce it.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.js ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1
CMD ["npm", "start"]
