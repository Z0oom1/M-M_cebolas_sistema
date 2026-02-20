# Sistema M&M Cebolas - Gestão e NF-e

Sistema completo para gestão de estoque, vendas e emissão de NF-e para a M&M Cebolas.

## 🚀 Funcionalidades Implementadas

- **Gestão de Estoque:** Controle de entradas, saídas e despesas.
- **Cadastros:** Clientes, Fornecedores e Produtos com NCM.
- **NF-e:** Geração de XML assinado (Modo Teste e Modo Real).
- **Administração:** 
  - Gestão de usuários (Admin pode criar contas para funcionários).
  - Alternância entre Modo Teste (Homologação) e Modo Sério (Produção).
  - Controle de acesso (Apenas Admin acessa configurações).
- **Interface:** Design moderno, responsivo e com correções visuais.

## 🛠️ Como Usar

### Servidor (Backend)
1. **Instalação:**
   ```bash
   cd server
   npm install
   ```
2. **Iniciar:**
   ```bash
   node server.js
   ```

### Aplicativo Desktop (Electron)
1. **Instalação:**
   ```bash
   npm install
   ```
2. **Desenvolvimento:**
   ```bash
   npm start
   ```
3. **Gerar Instaladores (.exe / .dmg):**
   ```bash
   npm run build
   ```

## 🔄 Auto-Update
O aplicativo desktop agora conta com atualização automática. Sempre que uma nova versão for publicada no GitHub (via Releases), o aplicativo detectará e baixará a atualização em segundo plano, notificando o usuário para reiniciar e aplicar as melhorias.

## 📄 Emissão de PDF
A emissão de DANFE (PDF) foi corrigida e agora utiliza a biblioteca `jspdf` no servidor para gerar o documento de forma consistente, permitindo o download direto pelo aplicativo ou navegador.

## ⚙️ Configurações de NF-e

No menu **Configurações** (acesso apenas para Admin), você pode alternar entre:
- **Modo Teste:** Para testar a emissão sem valor fiscal.
- **Modo Sério:** Para emissão de notas reais (requer certificado digital válido na pasta `certificado`).

---
*Desenvolvido para M&M Cebolas.*
