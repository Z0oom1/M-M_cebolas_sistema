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

1. **Instalação:**
   ```bash
   cd server
   npm install
   ```

2. **Iniciar o Servidor:**
   ```bash
   node server.js
   ```

3. **Acesso:**
   - Abra o navegador em `http://localhost:3000`
   - **Usuário Padrão:** `admin`
   - **Senha Padrão:** `123`

## ⚙️ Configurações de NF-e

No menu **Configurações** (acesso apenas para Admin), você pode alternar entre:
- **Modo Teste:** Para testar a emissão sem valor fiscal.
- **Modo Sério:** Para emissão de notas reais (requer certificado digital válido na pasta `certificado`).

---
*Desenvolvido para M&M Cebolas.*
