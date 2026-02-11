# Relatório de Erros de Design - Sistema M&M Cebolas

## Data da Análise
11 de fevereiro de 2026

---

## 1. TELA DE LOGIN

### 1.1 Problemas Visuais Identificados

#### ❌ **ERRO CRÍTICO: Barra de título quebrada no navegador web**
- **Descrição**: A barra de título customizada (titlebar) com os botões de fechar/minimizar/maximizar é visível na versão web, mas não deveria aparecer (é específica para Electron)
- **Impacto**: Confusão visual, elementos não funcionais na versão web
- **Localização**: `login.html` linhas 27-43 e 95-109
- **Solução**: Detectar se está rodando no Electron ou navegador e ocultar a barra quando for web

#### ❌ **ERRO: Inputs de login preenchidos por padrão**
- **Descrição**: Os campos de usuário e senha vêm preenchidos com "admin" e "123"
- **Impacto**: Segurança comprometida, má prática de UX
- **Localização**: `login.html` linhas 125-126
- **Solução**: Remover os atributos `value` dos inputs

#### ⚠️ **PROBLEMA: Botão FAB (Contas Rápidas) sem contexto**
- **Descrição**: Botão flutuante no canto inferior direito sem explicação clara
- **Impacto**: Usuário pode não entender sua função
- **Localização**: `login.html` linha 135-137
- **Solução**: Adicionar tooltip ou texto explicativo

#### ⚠️ **PROBLEMA: Link "Esqueceu a senha?" sem funcionalidade real**
- **Descrição**: Link apenas mostra um alert genérico
- **Impaco**: Frustração do usuário
- **Localização**: `login.html` linha 131
- **Solução**: Implementar fluxo real de recuperação ou remover se não for necessário

#### 🎨 **MELHORIA: Falta de feedback visual durante login**
- **Descrição**: Não há indicador de carregamento ao clicar em "ACESSAR SISTEMA"
- **Impacto**: Usuário não sabe se o sistema está processando
- **Solução**: Adicionar spinner ou desabilitar botão durante requisição

---

## 2. ANÁLISE PENDENTE

- [ ] Tela principal (home.html)
- [ ] Dashboard
- [ ] Entrada de produtos
- [ ] Saída de produtos
- [ ] Estoque detalhado
- [ ] Cadastros (Clientes/Fornecedores)
- [ ] NF-e
- [ ] Financeiro
- [ ] Configurações
- [ ] Responsividade mobile
- [ ] Testes de funcionalidade

---

## 3. ERROS DE CÓDIGO IDENTIFICADOS

### 3.1 Segurança

#### ❌ **CRÍTICO: Senhas armazenadas em texto plano**
- **Descrição**: Banco de dados armazena senhas sem hash
- **Localização**: `server/server.js` linha 100-101
- **Solução**: Implementar bcrypt para hash de senhas

#### ❌ **CRÍTICO: Autenticação sem token JWT**
- **Descrição**: Sistema usa apenas sessionStorage sem validação server-side
- **Localização**: `frontend/js/script.js` linha 38-52
- **Solução**: Implementar JWT tokens

#### ❌ **CRÍTICO: Sem validação de entrada no backend**
- **Descrição**: Endpoints aceitam dados sem validação adequada
- **Localização**: Múltiplos endpoints em `server.js`
- **Solução**: Adicionar validação com express-validator

### 3.2 Estrutura e Arquitetura

#### ⚠️ **PROBLEMA: Caminho hardcoded do certificado**
- **Descrição**: Caminho do Windows hardcoded no código
- **Localização**: `server/server.js` linha 13
- **Solução**: Usar apenas caminhos relativos ou variáveis de ambiente

#### ⚠️ **PROBLEMA: Tratamento de erros inconsistente**
- **Descrição**: Alguns endpoints não tratam erros adequadamente
- **Localização**: Vários endpoints em `server.js`
- **Solução**: Implementar middleware de erro global

#### ⚠️ **PROBLEMA: Vulnerabilidades de dependências**
- **Descrição**: 6 vulnerabilidades de alta severidade detectadas
- **Localização**: Dependências npm
- **Solução**: Executar `npm audit fix`

### 3.3 Performance

#### 🎨 **MELHORIA: Falta de índices no banco de dados**
- **Descrição**: Tabelas sem índices podem ter performance ruim com muitos dados
- **Localização**: `server/server.js` linhas 44-115
- **Solução**: Adicionar índices nas colunas mais consultadas

---

## 4. PRÓXIMOS PASSOS

1. ✅ Identificar erros na tela de login
2. ⏳ Fazer login e testar tela principal
3. ⏳ Testar cada funcionalidade individualmente
4. ⏳ Verificar responsividade
5. ⏳ Testar fluxo completo de NF-e
6. ⏳ Corrigir todos os erros identificados
7. ⏳ Validar correções

---

*Análise em andamento...*


---

## 2. TELA PRINCIPAL - DASHBOARD

### 2.1 Problemas Visuais Críticos

#### ❌ **ERRO CRÍTICO: Barra de título também aparece na tela principal**
- **Descrição**: Mesma barra customizada do Electron aparece no navegador web
- **Impacto**: Elementos não funcionais, espaço desperdiçado
- **Localização**: `home.html` linhas 23-55
- **Solução**: Ocultar quando não for Electron

#### ❌ **ERRO: Sidebar com números amarelos sem explicação**
- **Descrição**: Números amarelos (1, 2, 3, 5, 7, 8, 9) aparecem ao lado dos itens do menu
- **Impacto**: Poluição visual, confusão do usuário
- **Localização**: Provavelmente CSS ou JavaScript adicionando badges
- **Solução**: Remover ou explicar o significado desses números

#### ❌ **ERRO: Gráfico de "Distribuição de Estoque" vazio**
- **Descrição**: Gráfico aparece completamente vazio (sem dados)
- **Impacto**: Área desperdiçada, impressão de sistema incompleto
- **Localização**: `script.js` função `renderCharts`
- **Solução**: Mostrar mensagem "Sem dados" ou gráfico placeholder

#### ⚠️ **PROBLEMA: Tabela "Últimas Movimentações" vazia**
- **Descrição**: Tabela não mostra nenhum dado
- **Impacto**: Dashboard parece não funcionar
- **Localização**: `script.js` função `renderRecentTable`
- **Solução**: Verificar se há dados ou mostrar mensagem apropriada

#### ⚠️ **PROBLEMA: Gráfico "Balanço Financeiro" com dados mockados**
- **Descrição**: Gráfico mostra dados fixos (Jan, Fev, Mar...) não reais
- **Impacto**: Informação não reflete realidade do sistema
- **Localização**: `script.js` linhas 257-266
- **Solução**: Calcular dados reais das movimentações

### 2.2 Problemas de Layout

#### ⚠️ **PROBLEMA: Sidebar muito escura**
- **Descrição**: Contraste muito alto entre sidebar e conteúdo principal
- **Impacto**: Cansaço visual
- **Solução**: Suavizar cores ou adicionar transição gradual

#### 🎨 **MELHORIA: Cards de KPI sem ícones consistentes**
- **Descrição**: Alguns cards têm ícones, outros não
- **Impacto**: Inconsistência visual
- **Solução**: Padronizar todos os cards com ícones

#### 🎨 **MELHORIA: Falta de espaçamento entre elementos**
- **Descrição**: Elementos muito próximos uns dos outros
- **Impacto**: Interface "apertada"
- **Solução**: Aumentar padding/margin entre seções

### 2.3 Problemas de UX

#### ⚠️ **PROBLEMA: Sem indicador de loading ao trocar seções**
- **Descrição**: Ao clicar nos itens do menu, não há feedback visual
- **Impacto**: Usuário não sabe se o clique funcionou
- **Solução**: Adicionar spinner ou transição

#### 🎨 **MELHORIA: Menu mobile (hamburguer) visível em desktop**
- **Descrição**: Ícone de menu aparece mesmo em tela grande
- **Impacto**: Elemento desnecessário
- **Solução**: Ocultar em resoluções maiores que 1024px

---

## 3. ANÁLISE PENDENTE (ATUALIZADO)

- [x] Tela de login
- [x] Tela principal (Dashboard)
- [ ] Nova Entrada
- [ ] Nova Saída
- [ ] Estoque Detalhado
- [ ] Cadastros (Clientes/Fornecedores)
- [ ] NF-e
- [ ] Financeiro
- [ ] Configurações
- [ ] Responsividade mobile
- [ ] Testes de funcionalidade completos
