# =====================================================================
#  Interface web de la GMAO hospitalière
#
#  L'application est compilée en fichiers statiques puis servie par nginx,
#  qui relaie aussi les appels /api vers le conteneur de l'API. Un seul
#  point d'entrée pour le navigateur : pas de configuration CORS à tenir,
#  et le poste client n'a besoin que d'un port.
# =====================================================================
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY api/package.json ./api/
COPY web/package.json ./web/
RUN npm ci --workspace=@gmao/web --workspace=@gmao/partage --include-workspace-root

COPY shared ./shared
COPY web ./web
RUN npm run build --workspace=@gmao/web


FROM nginx:1.27-alpine AS production

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
