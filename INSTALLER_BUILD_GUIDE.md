# Guia de Construção de Instaladores Profissionais

## Visão Geral

O projeto agora está configurado para gerar instaladores profissionais e assinados para Windows (.exe) e macOS (.dmg) usando `electron-builder`.

## Configuração

### package.json - Seção Build

```json
{
  "build": {
    "appId": "com.mmcebolas.sistema",
    "productName": "M&M Cebolas",
    "directories": {
      "output": "dist"
    },
    "files": [
      "frontend/**/*",
      "package.json"
    ],
    "publish": [
      {
        "provider": "github",
        "owner": "Z0oom1",
        "repo": "M-M_cebolas_sistema"
      }
    ],
    "win": {
      "target": ["nsis"],
      "icon": "frontend/Imgs/Logo_M&M_Cebolas.png"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "installerIcon": "frontend/Imgs/Logo_M&M_Cebolas.png",
      "uninstallerIcon": "frontend/Imgs/Logo_M&M_Cebolas.png",
      "shortcutName": "M&M Cebolas"
    },
    "mac": {
      "target": ["dmg"],
      "icon": "frontend/Imgs/Logo_M&M_Cebolas.png"
    }
  }
}
```

## Scripts Disponíveis

### Desenvolvimento
```bash
npm start
```
Inicia o aplicativo em modo desenvolvimento.

### Build Completo
```bash
npm run build
```
Gera instaladores para a plataforma atual:
- Windows: `dist/M&M Cebolas Setup 0.1.2.exe`
- macOS: `dist/M&M Cebolas-0.1.2.dmg`

### Build para Windows
```bash
npm run build:win
```
Gera instalador NSIS (.exe) para Windows com:
- ✅ Instalador visual com wizard
- ✅ Atalho na área de trabalho
- ✅ Desinstalador profissional
- ✅ Ícone personalizado

### Build para macOS
```bash
npm run build:mac
```
Gera imagem de disco (.dmg) para macOS com:
- ✅ Interface drag-and-drop
- ✅ Ícone personalizado
- ✅ Assinatura automática (se certificado disponível)

### Publicar com Auto-Update
```bash
npm run publish
```
Compila e publica automaticamente no GitHub Releases, ativando o sistema de auto-update.

## Características do Instalador Windows (NSIS)

### Experiência do Usuário
- **Instalador com Wizard**: Interface amigável passo a passo
- **Seleção de Diretório**: Usuário pode escolher onde instalar
- **Atalho na Área de Trabalho**: Criado automaticamente
- **Desinstalador**: Remove completamente a aplicação
- **Menu Iniciar**: Integração com Windows Start Menu

### Arquivos Gerados
```
dist/
├── M&M Cebolas Setup 0.1.2.exe    ← Instalador principal
├── M&M Cebolas-0.1.2-x64.nsis.7z  ← Arquivo comprimido
└── builder-effective-config.yaml   ← Configuração usada
```

## Características do Instalador macOS (DMG)

### Experiência do Usuário
- **Imagem de Disco**: Interface intuitiva drag-and-drop
- **Ícone Personalizado**: Logo M&M Cebolas
- **Integração com Applications**: Instalação padrão macOS
- **Assinatura Digital**: Suporte a notarização (opcional)

### Arquivos Gerados
```
dist/
├── M&M Cebolas-0.1.2.dmg          ← Imagem de disco
├── M&M Cebolas-0.1.2-mac.zip      ← Backup comprimido
└── builder-effective-config.yaml   ← Configuração usada
```

## Processo de Build Passo a Passo

### 1. Preparar o Ambiente
```bash
# Instalar dependências
npm install

# Verificar versão em package.json
cat package.json | grep '"version"'
```

### 2. Testar Localmente
```bash
# Executar em desenvolvimento
npm start

# Validar funcionalidades principais
```

### 3. Gerar Instaladores
```bash
# Para Windows
npm run build:win

# Para macOS
npm run build:mac

# Para ambos
npm run build
```

### 4. Validar Instaladores
- **Windows**: Executar .exe e seguir wizard
- **macOS**: Montar .dmg e arrastar para Applications

### 5. Publicar (Opcional)
```bash
# Criar release no GitHub
git tag v0.1.2
git push origin v0.1.2

# Publicar com auto-update
npm run publish
```

## Assinatura Digital (Avançado)

### Windows - Assinatura com Certificado
```json
{
  "win": {
    "certificateFile": "path/to/certificate.pfx",
    "certificatePassword": "password",
    "signingHashAlgorithms": ["sha256"],
    "sign": "./customSign.js"
  }
}
```

### macOS - Notarização
```bash
# Configurar variáveis de ambiente
export APPLE_ID="seu@email.com"
export APPLE_ID_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="XXXXXXXXXX"

# Build com notarização automática
npm run build:mac
```

## Troubleshooting

### Erro: "Icon not found"
```bash
# Verificar se a imagem existe
ls -la frontend/Imgs/Logo_M&M_Cebolas.png

# Converter para ICO se necessário
# Use ferramentas online ou ImageMagick
```

### Erro: "NSIS not found" (Windows)
```bash
# Instalar NSIS globalmente
# Download: https://nsis.sourceforge.io/Download

# Ou usar WSL2 com Linux
```

### Arquivo muito grande
```bash
# Verificar tamanho
du -sh dist/

# Remover node_modules antes de buildar
rm -rf node_modules
npm install --production
npm run build
```

### Instalador não inicia
- Verificar logs em `%APPDATA%\M&M Cebolas\logs`
- Confirmar que `frontend/main.js` está correto
- Testar com `npm start` primeiro

## Distribuição

### Opção 1: GitHub Releases
```bash
# Criar release com tag
git tag v0.1.2
git push origin v0.1.2

# Fazer upload manual dos .exe e .dmg
# GitHub → Releases → Create Release
```

### Opção 2: Site Próprio
```bash
# Hospedar instaladores em servidor
# Atualizar URL em electron-updater config
```

### Opção 3: Instalador Automático
```bash
# Usar npm run publish
# Requer GITHUB_TOKEN configurado
npm run publish
```

## Próximos Passos

- [ ] Implementar assinatura digital de certificado
- [ ] Configurar notarização macOS
- [ ] Criar script de CI/CD (GitHub Actions)
- [ ] Adicionar splash screen durante instalação
- [ ] Implementar updater delta (apenas mudanças)

## Referências

- [Electron Builder Documentation](https://www.electron.build/)
- [NSIS Installer Guide](https://nsis.sourceforge.io/Docs/)
- [macOS Code Signing](https://developer.apple.com/support/code-signing/)
- [Electron Updater](https://www.electron.build/auto-update)
