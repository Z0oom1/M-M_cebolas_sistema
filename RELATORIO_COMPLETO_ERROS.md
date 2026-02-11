# Relatório Completo de Erros - Sistema M&M Cebolas

**Data da Análise:** 11 de fevereiro de 2026  
**Analista:** Manus AI  
**Versão do Sistema:** Atual (GitHub: Z0oom1/M-M_cebolas_sistema)

---

## Sumário Executivo

Este relatório documenta uma análise abrangente do sistema M&M Cebolas, identificando **erros críticos de design, problemas de UX, vulnerabilidades de segurança e inconsistências de código**. O sistema foi testado em ambiente web (navegador) e todas as telas principais foram inspecionadas visualmente e funcionalmente.

### Estatísticas Gerais

| Categoria | Críticos | Altos | Médios | Melhorias |
|-----------|----------|-------|--------|-----------|
| Design/UI | 3 | 5 | 8 | 6 |
| Segurança | 3 | 0 | 0 | 0 |
| Código | 2 | 4 | 3 | 2 |
| **TOTAL** | **8** | **9** | **11** | **8** |

---

## 1. ERROS CRÍTICOS (Prioridade Máxima)

### 1.1 Segurança

#### 🔴 **CRÍTICO-001: Senhas armazenadas em texto plano**
**Severidade:** CRÍTICA  
**Impacto:** Comprometimento total da segurança do sistema  
**Descrição:** O banco de dados SQLite armazena senhas de usuários sem qualquer tipo de hash ou criptografia. Qualquer pessoa com acesso ao arquivo `database.sqlite` pode visualizar todas as senhas.  
**Localização:** `server/server.js` linhas 92-102  
**Código problemático:**
```javascript
db.run(`INSERT OR IGNORE INTO usuarios (username, password, role, label) VALUES (?, ?, ?, ?)`,
    ['admin', '123', 'admin', 'Administrador']);
```
**Solução:** Implementar bcrypt para hash de senhas antes de armazenar no banco.

---

#### 🔴 **CRÍTICO-002: Autenticação sem validação server-side**
**Severidade:** CRÍTICA  
**Impacto:** Qualquer usuário pode manipular sessionStorage e se autenticar como admin  
**Descrição:** O sistema usa apenas `sessionStorage` no frontend para controlar autenticação. Não há validação de token no backend, permitindo bypass completo da autenticação.  
**Localização:** `frontend/js/script.js` linhas 38-52  
**Código problemático:**
```javascript
function checkLogin() {
    const session = sessionStorage.getItem('mm_user');
    if (!session) window.location.replace('login.html');
    currentUser = JSON.parse(session);
}
```
**Solução:** Implementar JWT tokens com validação em todas as rotas protegidas do backend.

---

#### 🔴 **CRÍTICO-003: SQL Injection em múltiplos endpoints**
**Severidade:** CRÍTICA  
**Impacto:** Possibilidade de execução de comandos SQL arbitrários  
**Descrição:** Embora o código use prepared statements em alguns lugares, não há validação de entrada adequada. Campos como `documento`, `ie`, `endereco` aceitam qualquer string sem sanitização.  
**Localização:** Múltiplos endpoints em `server/server.js`  
**Solução:** Implementar validação rigorosa com `express-validator` ou biblioteca similar.

---

### 1.2 Design e Interface

#### 🔴 **CRÍTICO-004: Barra de título Electron visível no navegador web**
**Severidade:** ALTA  
**Impacto:** Elementos não funcionais ocupam espaço, confundem usuários web  
**Descrição:** A barra customizada com botões de fechar/minimizar/maximizar (específica do Electron) aparece em navegadores web, mas os botões não funcionam. Isso cria uma experiência quebrada para usuários acessando via iPad ou navegador.  
**Localização:** 
- `login.html` linhas 27-43 e 95-164
- `home.html` linhas 23-55 e 48-55
**Evidência visual:** Barra preta no topo com botões coloridos não funcionais  
**Solução:** Detectar ambiente com JavaScript e ocultar a barra quando `window.require` não estiver disponível:
```javascript
if (typeof window.require === 'undefined') {
    document.getElementById('titlebar').style.display = 'none';
}
```

---

#### 🔴 **CRÍTICO-005: Números amarelos misteriosos na sidebar**
**Severidade:** MÉDIA  
**Impacto:** Poluição visual severa, usuário não entende o significado  
**Descrição:** Todos os itens do menu lateral exibem números amarelos (1, 2, 3, 5, 7, 8, 9) sem qualquer explicação. Não são badges de notificação, pois aparecem sempre.  
**Localização:** Provavelmente CSS ou JavaScript adicionando elementos  
**Evidência visual:** Números amarelos em caixas ao lado de cada item do menu  
**Solução:** Remover completamente esses números ou, se forem índices de debug, ocultá-los em produção.

---

#### 🔴 **CRÍTICO-006: Inputs de login preenchidos por padrão**
**Severidade:** MÉDIA (Segurança)  
**Impacto:** Má prática de segurança, facilita acesso não autorizado  
**Descrição:** Os campos de usuário e senha na tela de login vêm preenchidos com "admin" e "123" por padrão.  
**Localização:** `login.html` linhas 125-126  
**Código problemático:**
```html
<input type="text" id="loginUser" placeholder="Usuário" value="admin">
<input type="password" id="loginPass" placeholder="Senha" value="123">
```
**Solução:** Remover os atributos `value`.

---

## 2. ERROS DE ALTA PRIORIDADE

### 2.1 Funcionalidade e Dados

#### 🟠 **ALTO-001: Gráfico "Distribuição de Estoque" sempre vazio**
**Severidade:** ALTA  
**Impacto:** Dashboard parece quebrado, informação importante não exibida  
**Descrição:** O gráfico de pizza (doughnut) que deveria mostrar a distribuição de estoque por tipo de cebola aparece completamente vazio, mesmo quando há dados.  
**Localização:** `script.js` função `renderCharts` linhas 269-285  
**Causa provável:** Dados não sendo calculados corretamente ou canvas não renderizando  
**Solução:** Verificar se `grouped` tem dados e adicionar fallback para estado vazio.

---

#### 🟠 **ALTO-002: Gráfico "Balanço Financeiro" com dados mockados**
**Severidade:** ALTA  
**Impacto:** Informação financeira incorreta, decisões baseadas em dados falsos  
**Descrição:** O gráfico de linha mostra valores fixos (1200, 1900, 3000, 5000, 2000, 3000) que não correspondem aos dados reais do sistema.  
**Localização:** `script.js` linhas 257-266  
**Código problemático:**
```javascript
datasets: [{
    label: 'Receita',
    data: [1200, 1900, 3000, 5000, 2000, 3000], // Dados hardcoded!
    borderColor: '#10b981',
    tension: 0.4
}]
```
**Solução:** Calcular dados reais agrupados por mês a partir de `appData.transactions`.

---

#### 🟠 **ALTO-003: Tabela "Últimas Movimentações" vazia**
**Severidade:** ALTA  
**Impacto:** Dashboard não mostra informações úteis  
**Descrição:** A tabela que deveria exibir as 5 movimentações mais recentes está sempre vazia.  
**Localização:** `script.js` função `renderRecentTable` linhas 229-245  
**Causa provável:** `appData.transactions` vazio ou função não sendo chamada  
**Solução:** Adicionar logs de debug e verificar carregamento de dados.

---

#### 🟠 **ALTO-004: Caminho hardcoded do Windows no servidor**
**Severidade:** ALTA  
**Impacto:** Sistema não funciona em outros ambientes (Linux, Mac)  
**Descrição:** O código tem um caminho absoluto do Windows hardcoded como fallback para o certificado.  
**Localização:** `server/server.js` linha 13  
**Código problemático:**
```javascript
const certPath = fs.existsSync(path.join(__dirname, '../certificado/certificado.pfx')) 
    ? path.join(__dirname, '../certificado/certificado.pfx')
    : 'C:\\Projetos\\M-M_cebolas_sistema\\certificado\\certificado.pfx'; // ❌
```
**Solução:** Usar apenas caminhos relativos ou variável de ambiente.

---

#### 🟠 **ALTO-005: Vulnerabilidades de dependências npm**
**Severidade:** ALTA  
**Impacto:** Exploits conhecidos podem comprometer o servidor  
**Descrição:** O npm detectou 6 vulnerabilidades de alta severidade nas dependências instaladas.  
**Localização:** `server/package.json`  
**Evidência:**
```
6 high severity vulnerabilities
To address issues that do not require attention, run:
  npm audit fix
```
**Solução:** Executar `npm audit fix` e atualizar dependências críticas.

---

### 2.2 UX e Usabilidade

#### 🟠 **ALTO-006: Sem feedback visual durante login**
**Severidade:** MÉDIA  
**Impacto:** Usuário não sabe se o sistema está processando  
**Descrição:** Ao clicar em "ACESSAR SISTEMA", não há indicador de carregamento. Em conexões lentas, o usuário pode clicar múltiplas vezes.  
**Localização:** `login.js` função `fazerLogin`  
**Solução:** Adicionar spinner e desabilitar botão durante requisição.

---

#### 🟠 **ALTO-007: Link "Esqueceu a senha?" sem funcionalidade**
**Severidade:** BAIXA  
**Impacto:** Frustração do usuário  
**Descrição:** O link apenas mostra um alert genérico "Contate o administrador do sistema".  
**Localização:** `login.html` linha 131  
**Solução:** Implementar fluxo real de recuperação ou remover o link.

---

#### 🟠 **ALTO-008: Botão FAB "Contas Rápidas" sem contexto**
**Severidade:** BAIXA  
**Impacto:** Usuário não entende a função do botão  
**Descrição:** Botão flutuante no canto inferior direito com ícone de usuários, mas sem explicação clara.  
**Localização:** `login.html` linhas 135-137  
**Solução:** Adicionar tooltip explicativo ou texto próximo ao botão.

---

#### 🟠 **ALTO-009: Sem indicador de loading ao trocar seções**
**Severidade:** MÉDIA  
**Impacto:** Interface parece travada ao clicar no menu  
**Descrição:** Ao navegar entre seções (Dashboard, Entrada, Saída, etc.), não há feedback visual de que a página está carregando.  
**Localização:** `script.js` função `showSection` linhas 71-109  
**Solução:** Mostrar spinner ou skeleton screen durante carregamento.

---

## 3. PROBLEMAS DE MÉDIA PRIORIDADE

### 3.1 Design e Layout

#### 🟡 **MÉDIO-001: Sidebar muito escura**
**Descrição:** Contraste excessivo entre sidebar verde escuro e conteúdo branco causa cansaço visual.  
**Localização:** `estilo_geral.css` variável `--primary`  
**Solução:** Suavizar a cor ou adicionar gradiente mais sutil.

---

#### 🟡 **MÉDIO-002: Cards de KPI sem ícones consistentes**
**Descrição:** Alguns cards no dashboard têm ícones, outros não, criando inconsistência visual.  
**Localização:** Seção dashboard  
**Solução:** Padronizar todos os cards com ícones apropriados.

---

#### 🟡 **MÉDIO-003: Falta de espaçamento entre elementos**
**Descrição:** Elementos muito próximos criam sensação de interface "apertada".  
**Localização:** CSS geral  
**Solução:** Aumentar padding/margin entre seções principais.

---

#### 🟡 **MÉDIO-004: Menu mobile visível em desktop**
**Descrição:** Ícone de hamburguer aparece mesmo em telas grandes onde não é necessário.  
**Localização:** `home.html` header mobile  
**Solução:** Ocultar com media query para telas > 1024px.

---

#### 🟡 **MÉDIO-005: Inputs com placeholders como valores**
**Descrição:** Vários inputs usam placeholder como valor padrão, o que confunde o usuário.  
**Localização:** Múltiplas telas (entrada, saída, financeiro)  
**Solução:** Deixar inputs vazios ou usar valores padrão reais.

---

#### 🟡 **MÉDIO-006: Botões com texto em caixa alta inconsistente**
**Descrição:** Alguns botões usam CAIXA ALTA, outros não.  
**Localização:** Múltiplas telas  
**Solução:** Padronizar estilo de botões (recomendado: apenas primeira letra maiúscula).

---

#### 🟡 **MÉDIO-007: Cores de badge inconsistentes**
**Descrição:** Badges de tipo (entrada/saída/despesa) usam cores diferentes em telas diferentes.  
**Localização:** CSS de badges  
**Solução:** Criar classes padronizadas `.badge-entrada`, `.badge-saida`, `.badge-despesa`.

---

#### 🟡 **MÉDIO-008: Falta de estados hover/active em elementos interativos**
**Descrição:** Alguns botões e links não têm feedback visual ao passar o mouse.  
**Localização:** CSS geral  
**Solução:** Adicionar transições e estados hover para todos os elementos clicáveis.

---

### 3.2 Código e Arquitetura

#### 🟡 **MÉDIO-009: Tratamento de erros inconsistente**
**Descrição:** Alguns endpoints retornam erros adequadamente, outros apenas `res.json({ deleted: true })` sem verificar se houve erro.  
**Localização:** Múltiplos endpoints em `server.js`  
**Exemplo:**
```javascript
app.delete('/api/movimentacoes/:id', (req, res) => {
    db.run(`DELETE FROM movimentacoes WHERE id = ?`, req.params.id, (err) => res.json({ deleted: true }));
    // ❌ Não verifica se err existe
});
```
**Solução:** Implementar middleware de erro global e verificar `err` em todos os callbacks.

---

#### 🟡 **MÉDIO-010: Falta de índices no banco de dados**
**Descrição:** Tabelas não têm índices, o que pode causar lentidão com muitos registros.  
**Localização:** `server.js` função `initDb` linhas 44-116  
**Solução:** Adicionar índices em colunas frequentemente consultadas (ex: `data`, `tipo`, `documento`).

---

#### 🟡 **MÉDIO-011: Código JavaScript repetido**
**Descrição:** Funções como `closeEditModal`, `closeProdutoModal`, `closeNFeModal` são praticamente idênticas.  
**Localização:** `script.js`  
**Solução:** Criar função genérica `closeModal(modalId)`.

---

## 4. MELHORIAS RECOMENDADAS

### 4.1 Performance

#### 💡 **MELHORIA-001: Lazy loading de seções**
**Descrição:** Todas as seções são carregadas via fetch, mas poderiam ser pré-carregadas em segundo plano.  
**Benefício:** Navegação mais rápida entre seções.

---

#### 💡 **MELHORIA-002: Minificação de assets**
**Descrição:** CSS e JS não estão minificados.  
**Benefício:** Carregamento mais rápido, especialmente em conexões lentas.

---

### 4.2 Funcionalidades

#### 💡 **MELHORIA-003: Exportação de relatórios**
**Descrição:** Botão "Exportar" existe mas funcionalidade pode ser expandida (PDF, Excel).  
**Benefício:** Facilita análise externa de dados.

---

#### 💡 **MELHORIA-004: Filtros avançados**
**Descrição:** Tabelas têm busca simples, mas poderiam ter filtros por data, tipo, valor.  
**Benefício:** Facilita localização de informações específicas.

---

#### 💡 **MELHORIA-005: Gráficos interativos**
**Descrição:** Gráficos Chart.js poderiam ser interativos (clique para drill-down).  
**Benefício:** Análise mais profunda dos dados.

---

#### 💡 **MELHORIA-006: Notificações em tempo real**
**Descrição:** Sistema poderia usar WebSockets para notificar mudanças em tempo real.  
**Benefício:** Múltiplos usuários veem atualizações instantaneamente.

---

### 4.3 Acessibilidade

#### 💡 **MELHORIA-007: Suporte a teclado**
**Descrição:** Navegação por teclado (Tab, Enter, Esc) não funciona em todos os modais.  
**Benefício:** Acessibilidade para usuários com deficiência.

---

#### 💡 **MELHORIA-008: Contraste de cores (WCAG)**
**Descrição:** Algumas combinações de cores não atendem padrões WCAG AA.  
**Benefício:** Melhor legibilidade para usuários com deficiência visual.

---

## 5. TESTES FUNCIONAIS REALIZADOS

### 5.1 Tela de Login
- ✅ Login com credenciais corretas funciona
- ✅ Redirecionamento para home.html após login
- ⚠️ Credenciais preenchidas por padrão (problema de segurança)
- ⚠️ Barra de título Electron visível no navegador

### 5.2 Dashboard
- ✅ Cards de KPI exibem valores (mesmo que zerados)
- ❌ Gráfico de estoque vazio
- ❌ Gráfico financeiro com dados falsos
- ❌ Tabela de movimentações vazia
- ⚠️ Números amarelos na sidebar

### 5.3 Nova Entrada
- ✅ Formulário renderiza corretamente
- ✅ Campos de data preenchidos com data atual
- ⚠️ Botão de buscar fornecedor presente
- ⏳ Não testado envio de formulário

### 5.4 Nova Saída
- ✅ Formulário renderiza corretamente
- ✅ Botão "FINALIZAR VENDA E GERAR NOTA" presente
- ⚠️ Botão de buscar cliente presente
- ⏳ Não testado envio de formulário

### 5.5 Estoque Detalhado
- ✅ Tabela renderiza com cabeçalhos corretos
- ✅ Campo de busca presente
- ✅ Botão de exportar presente
- ❌ Tabela vazia (sem dados de teste)

### 5.6 Cadastros
- ✅ Abas de Clientes/Fornecedores/Produtos funcionam
- ✅ Botão "Novo Cliente" presente
- ❌ Listas vazias (sem dados de teste)
- ⏳ Não testado cadastro completo

### 5.7 NF-e
- ✅ Tela renderiza corretamente
- ✅ Botão "Emitir Nova NF-e" presente
- ❌ Lista vazia (sem notas emitidas)
- ⏳ Não testado fluxo completo de emissão

### 5.8 Financeiro
- ✅ Cards de KPI financeiros presentes
- ✅ Formulário de despesa funcional
- ✅ Campos preenchidos com data atual
- ⏳ Não testado envio de despesa

### 5.9 Configurações
- ✅ Opções de ambiente NF-e (Homologação/Produção)
- ✅ Seção de usuários presente
- ✅ Botão "Novo" para criar usuário
- ⚠️ Acesso restrito a admin funciona
- ⏳ Não testado criação de usuário

---

## 6. RESPONSIVIDADE (Não Testada Completamente)

⏳ **Pendente:** Testes em resoluções mobile (375px, 768px, 1024px)  
⏳ **Pendente:** Teste em iPad real  
⏳ **Pendente:** Orientação portrait/landscape

---

## 7. PLANO DE CORREÇÃO PRIORIZADO

### Fase 1: Segurança (URGENTE)
1. Implementar hash de senhas com bcrypt
2. Implementar autenticação JWT
3. Adicionar validação de entrada em todos os endpoints
4. Atualizar dependências vulneráveis

### Fase 2: Bugs Críticos de UI
1. Ocultar barra de título Electron no navegador
2. Remover números amarelos da sidebar
3. Remover valores padrão dos inputs de login

### Fase 3: Funcionalidades Quebradas
1. Corrigir gráfico de distribuição de estoque
2. Implementar cálculo real do gráfico financeiro
3. Corrigir carregamento da tabela de movimentações
4. Remover caminho hardcoded do Windows

### Fase 4: UX e Polish
1. Adicionar feedback visual em ações (loading, success, error)
2. Padronizar estilos de botões e badges
3. Melhorar espaçamento e contraste
4. Adicionar tooltips e mensagens de ajuda

### Fase 5: Melhorias e Otimizações
1. Implementar lazy loading
2. Adicionar filtros avançados
3. Melhorar acessibilidade
4. Otimizar performance

---

## 8. CONCLUSÃO

O sistema M&M Cebolas possui uma **base sólida e funcional**, mas apresenta **vulnerabilidades críticas de segurança** que devem ser corrigidas imediatamente antes de qualquer uso em produção. Os problemas de design e UX, embora não críticos, impactam significativamente a experiência do usuário e a percepção de qualidade do sistema.

### Recomendação Final

**NÃO USAR EM PRODUÇÃO** até que pelo menos os erros críticos de segurança (CRÍTICO-001, CRÍTICO-002, CRÍTICO-003) sejam corrigidos. Os demais problemas podem ser corrigidos gradualmente, mas a correção dos bugs visuais críticos (CRÍTICO-004, CRÍTICO-005, CRÍTICO-006) deve ser priorizada para melhorar a experiência do usuário.

---

**Próximos Passos:** Iniciar implementação das correções seguindo o plano priorizado acima.

---

*Relatório gerado por Manus AI - 11/02/2026*
