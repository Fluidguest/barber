# Como plugar as credenciais (WhatsApp e Mercado Pago)

Guia prático para quando você estiver de posse das credenciais. Vale para
**cada barbearia separadamente** — a configuração é por tenant, feita na tela
**Configurações** (perfil ADMIN), e os segredos ficam **cifrados** no banco
(AES-256-GCM). Nada disso precisa de deploy novo.

> **Antes de tudo:** os dois webhooks precisam de uma **URL pública HTTPS**.
> Em produção é a URL da sua API. Para testar na sua máquina, exponha o
> localhost com um túnel:
> ```bash
> npx cloudflared tunnel --url http://localhost:3333
> # ou: ngrok http 3333
> ```
> O túnel devolve algo como `https://abc-123.trycloudflare.com` — é essa URL
> que você informa nos painéis da Meta e do Mercado Pago.

---

## 1. WhatsApp (Meta Cloud API — oficial)

### 1.1 No painel da Meta

Em <https://developers.facebook.com> (a interface muda de tempos em tempos; o
que importa são os **nomes** abaixo):

1. **Criar app** → tipo **Empresa/Business**.
2. Adicionar o produto **WhatsApp**.
3. Em *WhatsApp → Configuração da API*, anote:
   - **Identificação do número de telefone** (`phone_number_id`) — é um número
     longo. **Não é** o telefone com DDI; é o ID interno.
   - **Identificação da conta do WhatsApp Business** (WABA ID).
4. **Token permanente** (o token temporário expira em 24h e não serve):
   - Vá em *Business Settings → Usuários → Usuários do sistema*;
   - crie um **usuário do sistema** com papel de admin;
   - **Adicionar ativos** → selecione o app e a conta do WhatsApp;
   - **Gerar token** com as permissões `whatsapp_business_messaging` e
     `whatsapp_business_management`;
   - copie o token (começa com `EAA...`). **Ele só aparece uma vez.**

### 1.2 Configurar no Barber SaaS

Entre como **ADMIN** → **Configurações**:

| Campo | O que colocar |
|---|---|
| Provedor | **Meta (oficial)** |
| Access Token | o token `EAA...` do usuário do sistema |
| Phone Number ID | a *identificação do número de telefone* |
| API Version | `v21.0` (ou a atual) |
| Verify Token | **você inventa** uma senha qualquer (ex.: `barber-verify-9f3k`) — só serve para a Meta provar que o webhook é seu |

Salve. O token fica cifrado; a tela passa a mostrar `•••••• (configurado)`.

### 1.3 Registrar o número → barbearia

Este passo é **essencial** e costuma ser esquecido: é ele que faz a mensagem
recebida cair na barbearia certa. Sem isso, as mensagens de entrada são
descartadas.

```bash
curl -X POST https://SUA-API/api/whatsapp/numbers \
  -H "Authorization: Bearer <SEU_ACCESS_TOKEN_DO_SISTEMA>" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumberId":"<O_MESMO_PHONE_NUMBER_ID>","label":"Principal"}'
```

> O `phone_number_id` é **único no sistema inteiro** (uma barbearia por número)
> — é assim que o webhook descobre o tenant sem precisar de login.

### 1.4 Apontar o webhook na Meta

Em *WhatsApp → Configuração → Webhook*:

- **URL de callback:** `https://SUA-API/api/whatsapp/webhook`
- **Token de verificação:** exatamente o mesmo *Verify Token* que você salvou
  em Configurações.
- Clique em **Verificar e salvar** (a Meta faz um `GET` e espera o eco).
- Em **Gerenciar**, assine o campo **`messages`**.

### 1.5 Testar

1. Mande uma mensagem do seu celular para o número da barbearia.
2. Ela deve aparecer em **Conversas** no sistema.
3. Responda pela tela — deve chegar no celular.

**Se não funcionar:**
- Webhook não verifica → *Verify Token* diferente entre Meta e Configurações.
- Mensagem não aparece → passo 1.3 não foi feito, ou o campo `messages` não foi
  assinado.
- Erro ao enviar → token temporário (expirou) ou sem as permissões acima.
- Número de teste da Meta só envia para telefones previamente cadastrados.

---

## 2. Mercado Pago (PIX no PDV)

### 2.1 Obter o Access Token

1. Acesse <https://www.mercadopago.com.br/developers/panel>.
2. **Suas integrações → Criar aplicação** (tipo: pagamentos online).
3. Em **Credenciais de produção**, copie o **Access Token** (`APP_USR-...`).
   - Há também credenciais de **teste** (`TEST-...`): use-as para experimentar
     sem mover dinheiro de verdade.
4. A conta precisa estar com **PIX ativo** (chave cadastrada no Mercado Pago).

### 2.2 Configurar no Barber SaaS

**Configurações** → seção **Pagamento no PDV**:

| Campo | O que colocar |
|---|---|
| Provedor | **Mercado Pago (PIX real)** |
| Access Token | o `APP_USR-...` (ou `TEST-...` para testar) |
| Segredo do webhook | opcional — a *assinatura secreta* do painel, se você usar |

> Enquanto o provedor estiver em **Demonstração**, o QR gerado é **fictício** e
> o botão "simular pagamento" aparece no PDV. Ao trocar para Mercado Pago, esse
> botão some e a cobrança passa a ser real.

### 2.3 Apontar o webhook

No painel da aplicação → **Webhooks / Notificações**:

- **URL:** `https://SUA-API/api/payments/webhook`
- **Evento:** **Pagamentos** (`payment`).

> O webhook só acelera a confirmação. Mesmo sem ele o PDV funciona: a tela
> consulta o Mercado Pago a cada 4 segundos enquanto a cobrança está pendente.
> Ou seja, firewall bloqueando o webhook **não quebra** a venda.

### 2.4 Testar

1. PDV → abra uma comanda, adicione um serviço.
2. **Cobrar por PIX** → o QR aparece.
3. Pague com o app do banco (comece com um valor baixo, R$ 1,00).
4. Em segundos o status vira **recebido** e o pagamento entra na comanda.

**Se não funcionar:**
- "Mercado Pago não configurado" → o token não foi salvo (ou salvou vazio).
- Erro ao gerar o QR → token de teste em conta de produção (ou vice-versa), ou
  PIX não habilitado na conta.
- Pago mas não confirma → veja o log da API; o `GET` de consulta roda mesmo sem
  webhook, então normalmente é token sem permissão de leitura.

---

## 3. Resumo do que é por barbearia x global

| Configuração | Onde |
|---|---|
| Token do WhatsApp, phone id, verify token | **Por barbearia** — tela Configurações |
| Token do Mercado Pago | **Por barbearia** — tela Configurações |
| Mapeamento número → barbearia | **Por barbearia** — `POST /whatsapp/numbers` |
| URL dos webhooks | **Global** — a mesma URL da API serve todas |
| `APP_URL`, `CORS_ORIGIN`, segredos do sistema | **Global** — `.env` (ver [DEPLOY.md](DEPLOY.md)) |

Cada barbearia usa **o seu próprio número e a sua própria conta** do Mercado
Pago — o dinheiro cai direto na conta dela, sem passar pela sua. O mesmo
webhook atende todas: o sistema descobre a barbearia pelo `phone_number_id`
(WhatsApp) ou pela cobrança (pagamento).

## 4. Segurança dos segredos

- Gravados **cifrados** (AES-256-GCM) com a `ENCRYPTION_KEY`.
- A API **nunca devolve** o valor — só `true/false` de "está configurado".
- Campos são *write-only*: deixar em branco mantém o valor atual.
- ⚠️ **Nunca troque a `ENCRYPTION_KEY` depois de salvar credenciais** — elas se
  tornam indecifráveis e precisam ser recadastradas.
