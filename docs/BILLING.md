# Billing

Planos: FREE, BASIC, PLUS, PRO, BUSINESS em `lib/config/plans.ts`.

Stripe Checkout, Customer Portal e webhooks:

- checkout.session.completed
- customer.subscription.updated
- customer.subscription.deleted
- invoice.paid
- invoice.payment_failed

Feature gates: `canUseFeature(plan, feature)` + modal de upgrade.

Créditos: grant/consume com ledger. Tipos incluem SUBSCRIPTION_GRANT, PURCHASE, VIDEO_ANALYSIS, TRANSCRIPTION, REFUND, ADMIN_ADJUSTMENT, PROMOTIONAL, EXPIRATION.
