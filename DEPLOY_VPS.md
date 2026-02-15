# Roteiro de Deploy - M&M Cebolas (VPS 72.60.8.186)

**Ambiente:** Ubuntu 24.04 LTS | Node.js v20 | SQLite | PM2 | PNPM  
**Domínio:** https://portalmmcebolas.com.br

---

## 1. Preparar a VPS

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Node.js 20 (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PNPM
sudo npm install -g pnpm

# PM2 (global)
sudo npm install -g pm2
```

---

## 2. Enviar o projeto para a VPS

No seu micro (a partir da pasta do projeto):

```bash
# Exemplo com rsync (ajuste usuário e IP)
rsync -avz --exclude node_modules --exclude .git --exclude "*.sqlite-journal" ./ usuario@72.60.8.186:/var/www/mm-cebolas/
```

Ou clone do repositório Git na VPS:

```bash
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www
git clone <url-do-repositorio> mm-cebolas
cd mm-cebolas
```

---

## 3. Configurar o backend na VPS

```bash
cd /var/www/mm-cebolas/server

# Dependências
pnpm install

# Copiar e editar .env de produção
cp .env.production.example .env
nano .env   # preencher JWT_SECRET, ADMIN_PASSWORD, NFE_MODO=producao, CERT_PASSWORD

# Certificado NF-e: colocar o .pfx em server/certificado/
mkdir -p certificado
# Enviar certificado.pfx para server/certificado/certificado.pfx (scp/rsync)

# Pasta de logs para PM2
mkdir -p logs
```

---

## 4. Rodar com PM2

```bash
cd /var/www/mm-cebolas/server

# Iniciar
pnpm exec pm2 start ecosystem.config.js

# Status e logs
pnpm exec pm2 status
pnpm exec pm2 logs mm-cebolas

# Reinício na inicialização do servidor
pnpm exec pm2 startup
pnpm exec pm2 save
```

Comandos úteis:

- `pm2 restart mm-cebolas` — reiniciar
- `pm2 stop mm-cebolas` — parar
- `pm2 logs mm-cebolas --lines 100` — últimas 100 linhas de log

---

## 5. Nginx (proxy reverso 80/443 → 3000)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Copiar configuração
sudo cp /var/www/mm-cebolas/server/nginx-portalmmcebolas.conf.example /etc/nginx/sites-available/portalmmcebolas

# Ajustar se necessário (caminhos do certificado SSL)
sudo nano /etc/nginx/sites-available/portalmmcebolas

# Ativar e testar
sudo ln -sf /etc/nginx/sites-available/portalmmcebolas /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Certificado SSL (Let's Encrypt) – se ainda não tiver
# Primeiro deixe apenas o server listen 80 no Nginx, depois:
sudo certbot --nginx -d portalmmcebolas.com.br -d www.portalmmcebolas.com.br
```

---

## 6. Verificação rápida

- **API:** `curl -s https://portalmmcebolas.com.br/api/` (pode retornar 404; o importante é não dar erro de conexão).
- **Login:** acessar https://portalmmcebolas.com.br no navegador e fazer login.
- **Electron:** abrir o app desktop e conferir se o login e as telas funcionam (API em https://portalmmcebolas.com.br).

---

## 7. Resumo dos arquivos revisados

| Arquivo | Alterações principais |
|--------|-------------------------|
| `frontend/js/script.js` | `API_URL` dinâmica (localhost:3000 vs portalmmcebolas.com.br), `checkEnvironment()` no `onload`, detecção Electron para titlebar |
| `server/server.js` | CORS para domínio/local/Electron, NF-e produção com certificado em `server/certificado/`, logs de erro detalhados |
| `frontend/main.js` | Título "M&M Cebolas", comentário sobre consumo da API na VPS |

---

## 8. Troubleshooting (logs na VPS)

```bash
# Logs da aplicação
pm2 logs mm-cebolas

# Erros PM2
cat /var/www/mm-cebolas/server/logs/pm2-error.log

# Nginx
sudo tail -f /var/log/nginx/error.log
```

No `server.js`, erros de autenticação, CORS e NF-e são logados no console (e no PM2) com prefixos `[Auth]`, `[CORS]` e `[NFe]` para facilitar o debug.
