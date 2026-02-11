# Implementação de NF-e e XML - M&M Cebolas

A funcionalidade de emissão de NF-e e geração de XML foi implementada com sucesso no sistema.

## Alterações Realizadas

### 1. Backend (Servidor)
- **Novo Serviço (`nfe-service.js`)**: Responsável por carregar o certificado digital (.pfx), gerar a Chave de Acesso da NF-e (44 dígitos), construir o XML no padrão 4.00 e realizar a assinatura digital RSA-SHA1.
- **Integração no `server.js`**:
    - Adicionada rota `POST /api/nfe/gerar` para criar e assinar notas.
    - Adicionada rota `GET /api/nfe/download/:id` para baixar o arquivo XML gerado.
    - Persistência das notas no banco de dados SQLite (tabela `nfe`).

### 2. Frontend (Interface)
- **Seção de NF-e**: Atualizada para permitir a visualização do histórico e a emissão de novas notas.
- **Modal de Emissão**: Interface amigável para selecionar Cliente, Produto, Quantidade e Valor, integrando com os cadastros existentes.
- **Botão de Download**: Permite baixar o XML assinado diretamente pelo navegador.

## Configurações Atuais
- **Certificado**: Configurado com o arquivo `.pfx` fornecido e a senha `12345678`.
- **Ambiente**: Configurado para **Homologação** (Sem valor fiscal). Para mudar para Produção, altere o terceiro parâmetro na inicialização do `NFeService` no arquivo `server.js` para `true`.
- **Emitente**: Configurado com os dados da **M&M HF COMERCIO DE CEBOLAS LTDA**.

## Como Usar
1. Acesse a aba **Notas Fiscais (NF-e)** no menu lateral.
2. Clique em **Nova NF-e**.
3. Selecione o Cliente e o Produto (clicando na lupa).
4. Informe a quantidade e o valor.
5. Clique em **Gerar e Assinar XML**.
6. A nota aparecerá no histórico, onde você poderá clicar em **Baixar XML**.

---
*Nota: Esta implementação foca na geração e assinatura do XML. Para o envio real à SEFAZ em ambiente de produção, recomenda-se a integração com um WebService de transmissão ou o uso de uma API de mensageria NF-e.*
