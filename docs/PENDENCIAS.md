# O que falta da sua parte

Só duas integrações dependem de você: **WhatsApp (Meta)** e **Claude (Anthropic)**. Todo o resto já funciona, em modo simulado enquanto elas não estiverem configuradas.

As credenciais podem ser colocadas em **um** destes lugares:
- no arquivo `.env` (recomendado; tem prioridade), ou
- em **Admin > Integrações**, no painel (ficam cifradas e não aparecem de novo).

Depois de configurar, reinicie (`npm run iniciar`) e use **Testar conexão** em Admin > Integrações. **A integração só conta como validada depois desse teste com as credenciais reais.**

---

## 1. Claude (Anthropic)

1. Crie uma conta em https://platform.claude.com
2. Adicione créditos em *Billing* (sugestão: defina também um limite de gasto lá).
3. Gere uma chave em *API keys*.
4. Preencha no `.env`:
   ```
   ANTHROPIC_API_KEY="sk-ant-..."
   ```
5. Em **Admin > IA**: escolha o modelo (padrão **Claude Opus 5.5**; Sonnet e Haiku são mais baratos), o esforço de raciocínio e os limites diário e mensal. Confira a tabela de preços com https://claude.com/pricing.

A chave da OpenAI é **opcional**: só serve como provedor alternativo e para embeddings da base de conhecimento. Sem ela, a busca na base usa palavras-chave (BM25).

## 2. WhatsApp Business Cloud API (Meta)

1. Crie ou acesse sua conta no **Meta Business** (business.facebook.com) e conclua a verificação da empresa.
2. Em **Meta Developers** (developers.facebook.com), crie um app do tipo *Empresa* e adicione o produto **WhatsApp**.
3. Adicione e verifique o **número comercial** (ele não pode estar em uso no app comum do WhatsApp).
4. Crie um **System User** no Meta Business com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`, e gere um **token permanente**.
5. Preencha no `.env`:
   ```
   WHATSAPP_TOKEN="EAA..."                  # token permanente do System User
   WHATSAPP_PHONE_NUMBER_ID="..."           # WhatsApp > Configuração da API
   WHATSAPP_BUSINESS_ACCOUNT_ID="..."       # WhatsApp > Configuração da API
   WHATSAPP_APP_SECRET="..."                # Configurações do app > Básico > Chave secreta
   APP_URL="https://seu-endereco-publico"   # a Meta exige HTTPS público
   ```
   `WHATSAPP_VERIFY_TOKEN` já foi gerado pelo `npm run setup`. Use o mesmo valor no passo 6.
6. No app da Meta, em *WhatsApp > Configuração > Webhook*:
   - **URL de callback**: `https://SEU_APP_URL/api/webhooks/whatsapp` (aparece pronta em Admin > Integrações)
   - **Verificar token**: o valor de `WHATSAPP_VERIFY_TOKEN` do seu `.env`
   - Assine o campo **messages**.
   - Para testar localmente, exponha o sistema com um túnel HTTPS (ex.: Cloudflare Tunnel) e coloque essa URL em `APP_URL`.
7. No **WhatsApp Manager**, crie e envie para aprovação um **template de marketing** para o primeiro contato. Depois de aprovado, coloque o nome exato em **Admin > Agente > Nome do template**.
8. Opcional: em **Admin > WhatsApp**, informe o custo por template para estimar gastos.

---

## Antes de usar com clientes reais

- Cadastre seus **serviços, preços, prazos e limites de desconto** em Admin > Serviços e preços. Sem isso, o agente não informa preços.
- Revise a **base de conhecimento** e as **instruções do agente**.
- Lembre: telefone público não é autorização. Registre o opt-in de cada lead (origem e base legal) antes de iniciar o contato.
