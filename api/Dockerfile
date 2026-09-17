# =====================================================================
#  API de la GMAO hospitalière
#
#  Construction en deux temps : les dépendances et le bundle sont produits
#  dans une image jetable, seul le résultat part en production. L'image
#  finale ne contient ni sources TypeScript ni outils de compilation.
# =====================================================================
FROM node:22-alpine AS build

WORKDIR /app

# Les manifestes d'abord : tant qu'ils ne changent pas, Docker réutilise la
# couche d'installation, ce qui évite de retélécharger les dépendances à
# chaque modification du code.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY api/package.json ./api/
COPY web/package.json ./web/
RUN npm ci --workspace=@gmao/api --workspace=@gmao/partage --include-workspace-root

COPY shared ./shared
COPY api ./api
RUN npm run build --workspace=@gmao/api


FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Dépendances de production seulement.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY api/package.json ./api/
COPY web/package.json ./web/
RUN npm ci --omit=dev --workspace=@gmao/api --workspace=@gmao/partage --include-workspace-root \
 && npm cache clean --force

COPY --from=build /app/api/dist ./api/dist
COPY api/migrations ./api/migrations
# Le lanceur des commandes d'administration : il choisit le paquet compilé,
# faute de sources et de tsx dans cette image.
COPY api/lancer.mjs ./api/lancer.mjs
COPY api/package.json ./api/package.json

# Le serveur ne tourne pas en root : une faille applicative ne doit pas
# donner les pleins pouvoirs sur le conteneur.
RUN addgroup -S gmao && adduser -S gmao -G gmao && chown -R gmao:gmao /app
USER gmao

ENV MIGRATIONS_DIR=/app/api/migrations
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "api/dist/index.js"]
