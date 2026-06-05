# Stripe Go-Live — SEPA + Deutsche Rechnung

---

## 1. Stripe-Konto (DE)

1. [Stripe Dashboard](https://dashboard.stripe.com) → Geschäftsland **Deutschland**
2. **Settings → Business** → Firmenadresse, USt-IdNr., Bankverbindung
3. **Settings → Customer emails** → Rechnungen aktivieren (DE-Vorlage)
4. **Settings → Billing → Customer portal** → Locale DE, Rechnungshistorie sichtbar
5. **Settings → Tax** → Stripe Tax aktivieren (optional, `STRIPE_AUTOMATIC_TAX=true`)

---

## 2. Produkte & Preise

Im Dashboard oder per CLI drei **recurring** Prices anlegen (EUR, monatlich):

| Plan | Env-Variable | Beispielpreis |
|------|--------------|---------------|
| Basic | `STRIPE_PRICE_BASIC` | 299 € |
| Pro | `STRIPE_PRICE_PRO` | 399 € |
| Enterprise | `STRIPE_PRICE_ENTERPRISE` | 500 € |

Preis-IDs in `.env` eintragen (Format `price_...`).

---

## 3. Backend `.env` (Production)

```env
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
STRIPE_AUTOMATIC_TAX=true
```

---

## 4. Webhook

Endpoint: `https://api.myfleet.app/api/v1/billing/webhook`

Events abonnieren:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

```bash
cd backend && npm run verify:stripe
```

---

## 5. SEPA-Testzahlung (Live)

1. Admin → `/billing`
2. Rechnungs-E-Mail eintragen
3. Plan wählen → **Mit SEPA abonnieren**
4. Im Stripe Checkout:
   - Firmenadresse (DE)
   - **USt-IdNr.** eingeben (Pflicht bei B2B)
   - SEPA-Lastschriftmandat erteilen
5. Erfolg → `/billing?checkout=success`
6. Stripe Dashboard → Rechnung als PDF prüfen (DE, USt.)

---

## 6. Akzeptanzkriterien

- [ ] SEPA-Lastschrift im Checkout wählbar
- [ ] USt-IdNr. wird abgefragt (`tax_id_collection.required: if_supported`)
- [ ] Deutsche Rechnungs-PDF per E-Mail
- [ ] Webhook synchronisiert `tenant_subscription` Status
- [ ] Kundenportal auf Deutsch (`locale: de`)

---

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| Checkout startet nicht | `STRIPE_PRICE_*` + `STRIPE_ENABLED=true` |
| Webhook 400 | `STRIPE_WEBHOOK_SECRET` + Raw Body (bereits konfiguriert) |
| Keine USt-IdNr. Feld | EU B2B Tax ID Collection in Stripe aktivieren |
| Rechnung nur EN | Stripe Business Locale DE + Customer emails DE |
