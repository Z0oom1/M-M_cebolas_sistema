# Guia de Deploy Automático (Alternativa ao FileZilla)

Para parar de usar o FileZilla e fazer com que a sua VPS atualize automaticamente quando você envia seu código (via Git), siga os passos abaixo usando um **Git Hook (Post-Receive)**. Essa é a maneira mais simples, rápida e segura de gerenciar as atualizações.

## Passo 1: Configurar a VPS (Servidor)

1. Conecte-se à sua VPS via SSH:
   ```bash
   ssh root@seu_ip_da_vps
   ```

2. Crie um repositório Git "Bare" (um repositório que serve apenas para receber os arquivos, sem pasta de trabalho visível):
   ```bash
   mkdir -p /var/repo/mm_cebolas.git
   cd /var/repo/mm_cebolas.git
   git init --bare
   ```

3. Crie o diretório onde sua aplicação Node.js realmente roda (caso já não exista). Vamos supor que seja `/var/www/mm_cebolas`:
   ```bash
   mkdir -p /var/www/mm_cebolas
   ```

4. Crie um arquivo chamado `post-receive` dentro da pasta `hooks` do repositório Bare. Este script vai extrair o código novo para a pasta da aplicação e reiniciar o sistema automaticamente:
   ```bash
   nano /var/repo/mm_cebolas.git/hooks/post-receive
   ```

5. Cole o seguinte conteúdo dentro do editor (ajuste os caminhos se sua aplicação estiver em outro lugar):
   ```bash
   #!/bin/bash
   
   # Onde o código real vai ficar
   TARGET="/var/www/mm_cebolas"
   
   # Onde está o repositório bare
   GIT_DIR="/var/repo/mm_cebolas.git"
   
   # Despeja o código recebido na pasta Target
   git --work-tree=$TARGET --git-dir=$GIT_DIR checkout -f
   
   echo "📦 Código copiado para $TARGET."
   
   # Entra na pasta e instala dependências / reinicia PM2
   cd $TARGET/server
   echo "⚙️ Instalando dependências..."
   npm install --production
   
   echo "🚀 Reiniciando a aplicação..."
   pm2 restart server || pm2 start server.js --name "server"
   
   echo "✅ Deploy Concluído com Sucesso!"
   ```
   *(Pressione `CTRL+O`, `Enter`, e `CTRL+X` para salvar e sair do Nano)*

6. Dê permissão de execução para o script:
   ```bash
   chmod +x /var/repo/mm_cebolas.git/hooks/post-receive
   ```

## Passo 2: Configurar o seu Computador Local (Windows)

Agora você precisa avisar o Git do seu computador que a sua VPS é um "destino" válido.

1. Abra o terminal (PowerShell ou Git Bash) na pasta do seu projeto local (`c:\Users\caio\Desktop\M-M_cebolas_sistema`).
2. Adicione a sua VPS como um repositório remoto chamado `vps` (Substitua `IP_DA_VPS` pelo IP real da sua máquina):
   ```bash
   git remote add vps ssh://root@IP_DA_VPS/var/repo/mm_cebolas.git
   ```

## Passo 3: Como fazer o Deploy (Daqui pra frente)

Esqueça o FileZilla. Sempre que você fizer alterações no código, tudo o que você precisará fazer é:

1. Adicionar os arquivos alterados:
   ```bash
   git add .
   ```
2. Salvar (Commit):
   ```bash
   git commit -m "Nova atualização: Correções na NFe e Layout"
   ```
3. **Fazer o Deploy:**
   ```bash
   git push vps master
   ```

O Git enviará os arquivos por baixo dos panos (comprimidos, bem mais rápido que o FileZilla), e a sua VPS vai imprimir no seu terminal:
```text
remote: 📦 Código copiado para /var/www/mm_cebolas.
remote: ⚙️ Instalando dependências...
remote: 🚀 Reiniciando a aplicação...
remote: ✅ Deploy Concluído com Sucesso!
```
