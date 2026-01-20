# Environment Setup

Create a `.env.local` file in the webapp directory with the following variables:

## Required for Stripe Payments

```bash
# Get your keys from: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

# Create a product and price in Stripe Dashboard, then add the price ID
# https://dashboard.stripe.com/products
STRIPE_PRICE_ID=price_your_price_id_here

# Stripe Webhook Secret (for handling subscription events)
# Get this when you create a webhook endpoint: https://dashboard.stripe.com/webhooks
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# App URL (update when deploying)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Setup Steps

1. Create a Stripe account at https://stripe.com (free)
2. Go to Dashboard > Developers > API keys
3. Copy your test keys (start with `sk_test_` and `pk_test_`)
4. Create a Product with a recurring Price ($5/month)
5. Copy the Price ID
6. Create the `.env.local` file with these values

## Note

The app works WITHOUT Stripe configuration - payments just won't be enabled.
All core functionality (upload, processing, dashboard) works immediately.
