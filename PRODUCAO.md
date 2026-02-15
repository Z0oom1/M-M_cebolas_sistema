# Guia de Produção - M&M Cebolas

Este documento descreve as melhorias implementadas para garantir a segurança e estabilidade do sistema em ambiente de produção.

## 🔒 Segurança e Configuração

### 1. Variáveis de Ambiente (.env)
Todas as configurações sensíveis foram movidas para o arquivo `server/.env`.
**Ação Necessária:** Edite o arquivo `server/.env` e altere as senhas padrão e a chave secreta JWT.

```env
JWT_SECRET=sua_chave_secreta_aqui
ADMIN_PASSWORD=nova_senha_admin
VINICIUS_PASSWORD=nova_senha_vinicius
FUNCIONARIO_PASSWORD=nova_senha_funcionario
NFE_MODO=producao
CERT_PASSWORD=senha_do_certificado
```

### 2. Senhas dos Usuários
O sistema agora sincroniza as senhas dos usuários `admin`, `vinicius` e `funcionario` diretamente do arquivo `.env` na inicialização.

### 3. Modo da NF-e
O modo de emissão (homologação/produção) agora é controlado pela variável `NFE_MODO` no `.env`.

---

## ⚙️ Melhorias no Sistema

### 1. Validação de Duplicidade
O sistema agora impede o cadastro de clientes ou fornecedores com o mesmo CPF/CNPJ, evitando inconsistências fiscais.

### 2. Backup Automático
Foi adicionado um script de backup para o banco de dados SQLite.
- **Arquivo:** `server/backup.js`
- **Execução:** `npm run backup` (ou `pnpm run backup`)
- **Funcionamento:** Cria uma cópia datada do banco de dados na pasta `server/backups` e mantém apenas os últimos 7 dias.

---

## 🌐 Infraestrutura Recomendada

### 1. Gerenciador de Processos (PM2)
Para garantir que o servidor reinicie automaticamente em caso de falha:
```bash
sudo npm install -g pm2
cd server
pm2 start server.js --name "mm-cebolas-api"
pm2 save
pm2 startup
```

### 2. Certificado SSL e Nginx
Para habilitar HTTPS, recomenda-se o uso do Nginx como proxy reverso com Let's Encrypt.

---

## ✅ Checklist de Implantação
1. [ ] Configurar o arquivo `server/.env`.
2. [ ] Colocar o certificado digital real em `certificado/certificado.pfx`.
3. [ ] Instalar as dependências (`pnpm install`).
4. [ ] Iniciar o servidor com PM2.
5. [ ] Configurar uma tarefa cron para o backup diário:
   `0 0 * * * cd /caminho/do/projeto/server && /usr/bin/npm run backup`
