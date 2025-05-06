FROM node:20.18.0-bullseye AS base
WORKDIR /usr/src/app

# Alias de construcción que extiende de base
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 3: Builder - Copia el código fuente y construye la aplicación
FROM deps AS builder
# Copia el resto del código fuente encima de las dependencias ya instaladas
COPY . .
# Ejecuta el script de build definido en tu package.json
RUN npm run build
# Opcional: Puedes eliminar las devDependencies aquí para reducir el tamaño de node_modules
# si planeas copiar node_modules en lugar de reinstalar en la etapa final.
# RUN npm prune --production

# Stage 4: Production - Imagen final ligera con sólo lo necesario para ejecutar
FROM base AS production
ENV NODE_ENV=production
WORKDIR /usr/src/app

# Copia los archivos de definición de dependencias
COPY --from=deps /usr/src/app/package.json /usr/src/app/package-lock.json* ./
# Copia el directorio 'dist' compilado desde el builder
COPY --from=builder /usr/src/app/dist ./dist

COPY --from=builder /usr/src/app/views ./views
COPY --from=builder /usr/src/app/public ./public

# Copia los node_modules de producción (alternativa a reinstalar)
# Esto es generalmente más rápido y usa los módulos exactos del paso 'deps'/'builder'
# Asegúrate de que `npm prune --production` NO se ejecutó en el builder si usas esta opción.
# O que `npm ci` en 'deps' fue suficiente (sin prune posterior)
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Alternativa: Instalar sólo dependencias de producción (más limpio si no copias node_modules)
# COPY --from=deps /usr/src/app/package.json /usr/src/app/package-lock.json* ./
# RUN npm ci --omit=dev --ignore-scripts # Instala solo producción, más rápido

EXPOSE 3000

# Comando por defecto para iniciar la aplicación compilada
CMD ["node", "dist/main.js"]

FROM deps AS development
# Re-copia el código por si acaso, aunque deps ya lo hizo para package*.json
COPY . .
# Instala herramientas globales si las necesitas específicamente en el contenedor de dev
RUN npm install -g @nestjs/cli
EXPOSE 3000
# El comando CMD/ENTRYPOINT se suele sobreescribir en docker-compose para desarrollo
CMD ["npm", "run", "start:dev"]

