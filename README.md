# 🧅 M&M Cebolas - Sistema de Gestão

![Logo M&M Cebolas](frontend/Imgs/logo_M&M.jpg)

Sistema profissional de gestão de estoque, vendas e emissão de notas fiscais (NF-e) desenvolvido especificamente para a **M&M Cebolas**. O sistema oferece uma interface moderna, alta performance e controle total sobre a cadeia de suprimentos.

---

## 🚀 Funcionalidades Principais

### 📊 Dashboard Analítico
- Visão em tempo real de vendas e compras.
- Gráficos interativos com **Chart.js**.
- Resumo de estoque e alertas de baixo nível.
- Cards dinâmicos com micro-animações.

### 📦 Gestão de Estoque e Produtos
- Cadastro de variedades de cebolas com ícones personalizados.
- Controle rigoroso de entrada (compras) e saída (vendas).
- Cálculo automático de peso total (Kg) baseado na quantidade de caixas.

### 📄 Notas Fiscais (NF-e)
- Emissão de NF-e profissional integrada com a SEFAZ.
- Geração de **DANFE** em PDF com código de barras e QR Code.
- Gerenciamento de certificados digitais e XMLs.

### 💰 Financeiro
- Fluxo de caixa detalhado.
- Histórico de transações vinculadas a clientes e fornecedores.

### 🛡️ Segurança e Acesso
- Sistema de login com múltiplos níveis de acesso (Admin, Chefe, Operador).
- Senhas criptografadas com **BCrypt**.
- Autenticação via **JWT (JSON Web Tokens)**.

---

## 🛠️ Tecnologias Utilizadas

### Frontend
- **HTML5/CSS3**: Layout moderno com Glassmorphism e CSS Variables.
- **JavaScript (Vanilla)**: Lógica de interface e interações.
- **Chart.js**: Visualização de dados.
- **FontAwesome**: Iconografia profissional.

### Backend
- **Node.js**: Ambiente de execução.
- **Express.js**: Framework web para API.
- **SQLite3**: Banco de dados relacional leve e eficiente.
- **PM2**: Gerenciamento de processos em produção.

---

## 📁 Estrutura do Projeto

```text
├── frontend/             # Interface do usuário (HTML, CSS, JS)
│   ├── pages/            # Páginas do sistema
│   ├── css/              # Estilização
│   ├── js/               # Scripts de front
│   └── Imgs/             # Ativos visuais (Logos, Ícones)
├── server/               # Backend e Lógica de Negócio
│   ├── server.js         # API principal
│   ├── database.sqlite   # Banco de dados
│   ├── nfe-service.js    # Serviço de integração fiscal
│   └── backups/          # Cópias de segurança automáticas
├── DEPLOY.md             # Guia de deploy em VPS
└── README.md             # Este arquivo
```

---

## ⚙️ Instalação e Execução

### Pré-requisitos
- Node.js (v16 ou superior)
- Git

### Passo a Passo
1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/Z0oom1/M-M_cebolas_sistema.git
   cd M-M_cebolas_sistema
   ```

2. **Configurar o Servidor:**
   ```bash
   cd server
   npm install
   ```

3. **Configurar Variáveis de Ambiente:**
   - Crie um arquivo `.env` na pasta `server` baseando-se no `.env.production.example`.

4. **Executar o Sistema:**
   ```bash
   npm start
   ```

---

## 🚢 Deploy (VPS)

O sistema conta com um fluxo de **Deploy Automático** via Git Hooks.
Sempre que você realizar alterações, basta rodar:

```bash
git add .
git commit -m "Minhas alterações"
git push origin main  # Atualiza o GitHub
git push vps main     # Atualiza o Servidor em Produção
```

*Para mais detalhes sobre a configuração do servidor, veja o arquivo [DEPLOY.md](DEPLOY.md).*

---

## ⚖️ Licença

Este projeto é de uso exclusivo da **M&M Cebolas**. Todos os direitos reservados.

---
*Desenvolvido com ❤️ para a gestão de excelência da M&M Cebolas.*
