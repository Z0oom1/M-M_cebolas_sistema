# Documentação - Sistema de Auto-Update

## Visão Geral

O aplicativo Electron agora possui um sistema de **atualização automática** integrado que verifica novas versões no GitHub e as instala sem intervenção do usuário.

## Implementação

### 1. **Dependências Instaladas**
- `electron-updater` (v6.1.7) - Gerenciador de atualizações
- `electron-builder` (v24.13.3) - Construtor de instaladores

### 2. **Configuração no main.js**

O arquivo `frontend/main.js` foi atualizado com:

```javascript
const { autoUpdater } = require('electron-updater');

// Configuração básica
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Eventos de atualização
autoUpdater.on('update-available', () => {
    // Notifica o usuário que uma atualização está disponível
});

autoUpdater.on('update-downloaded', () => {
    // Oferece opção de reiniciar agora ou depois
});

// Verificar atualizações ao iniciar
autoUpdater.checkForUpdatesAndNotify();
```

### 3. **Configuração no package.json**

O `package.json` foi configurado com:

```json
{
  "build": {
    "appId": "com.mmcebolas.sistema",
    "productName": "M&M Cebolas",
    "publish": [
      {
        "provider": "github",
        "owner": "Z0oom1",
        "repo": "M-M_cebolas_sistema"
      }
    ]
  }
}
```

## Como Funciona

1. **Verificação Automática**: Ao iniciar o aplicativo, verifica se há novas versões no GitHub
2. **Download em Segundo Plano**: Se houver atualização, faz download sem bloquear o uso
3. **Notificação ao Usuário**: Exibe diálogo informando que a atualização está pronta
4. **Instalação**: Ao reiniciar o aplicativo, a atualização é instalada automaticamente

## Fluxo de Atualização

```
Usuário inicia app
    ↓
Verifica versão no GitHub
    ↓
Versão nova disponível? 
    ├─ SIM → Baixa em background
    │         ↓
    │      Notifica usuário
    │         ↓
    │      Usuário reinicia?
    │      ├─ SIM → Instala atualização
    │      └─ NÃO → Instala ao próximo reinício
    │
    └─ NÃO → Continua normalmente
```

## Publicando Atualizações

Para publicar uma nova versão:

1. **Atualizar versão** em `package.json`:
   ```json
   "version": "0.1.3"
   ```

2. **Fazer commit e push**:
   ```bash
   git add .
   git commit -m "Release: v0.1.3"
   git push origin main
   ```

3. **Criar Release no GitHub**:
   - Ir para GitHub → Releases
   - Criar nova release com tag `v0.1.3`
   - Anexar o arquivo do instalador (.exe ou .dmg)
   - Publicar

4. **Usuários receberão notificação** na próxima verificação

## Variáveis de Ambiente

Para funcionar corretamente, configure:

```bash
# .env (opcional, para CI/CD)
GITHUB_TOKEN=seu_token_aqui
```

## Troubleshooting

### Atualização não aparece
- Verifique se a versão em `package.json` é maior que a instalada
- Confirme que o Release foi publicado no GitHub
- Reinicie o aplicativo

### Erro ao baixar atualização
- Verifique conexão de internet
- Confirme que o repositório é público ou que o token está configurado
- Verifique logs em: `%APPDATA%\M&M Cebolas\logs` (Windows)

## Segurança

O `electron-updater` valida:
- ✅ Integridade dos arquivos baixados
- ✅ Assinatura digital (se configurada)
- ✅ Origem do servidor (GitHub)

## Próximos Passos

- [ ] Configurar assinatura digital de instaladores
- [ ] Implementar delta updates (baixar apenas mudanças)
- [ ] Adicionar rollback automático em caso de erro
