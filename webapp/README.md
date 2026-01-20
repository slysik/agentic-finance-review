# FinanceDash - Personal Finance Dashboard SaaS

Transform bank CSV exports into beautiful, actionable financial dashboards.

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Deploy to Vercel (Free)

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/finance-dash)

### Manual Deploy

1. Push this code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) and sign up (free)
3. Click "Import Project" and select your repository
4. Vercel auto-detects Next.js - just click Deploy
5. Your app is live at `your-project.vercel.app`

## Features

- **CSV Upload**: Drag & drop bank statement CSVs
- **Auto-Categorization**: 20+ transaction categories recognized
- **Visual Charts**: Pie charts, bar graphs, trend lines
- **100% Private**: All processing happens in the browser
- **Responsive**: Works on desktop and mobile

## Monetization (Optional)

To enable paid subscriptions:

1. Create a [Stripe](https://stripe.com) account
2. Create a Product with $5/month price
3. Add environment variables (see `ENV_SETUP.md`)
4. The "Upgrade to Pro" button will start working

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Charts**: Recharts
- **Payments**: Stripe
- **Hosting**: Vercel (free tier)

## File Structure

```
webapp/
├── app/
│   ├── page.tsx           # Landing page with upload
│   ├── dashboard/page.tsx # Financial dashboard
│   ├── api/checkout/      # Stripe checkout API
│   └── globals.css        # Tailwind styles
├── lib/
│   ├── csv-processor.ts   # CSV parsing & processing
│   └── categorizer.ts     # Transaction categorization
└── components/            # Reusable UI components
```

## Supported Bank Formats

The app auto-detects columns from most bank CSV exports:
- Chase, Bank of America, Wells Fargo
- Capital One, Discover, American Express
- Most other US banks with standard CSV export

Required columns (auto-detected):
- Date
- Description
- Amount (or separate Withdrawal/Deposit columns)
- Balance (optional but recommended)

## Revenue Potential

| Users | Free Tier | Pro ($5/mo) | Monthly Revenue |
|-------|-----------|-------------|-----------------|
| 100   | 80        | 20          | $100            |
| 500   | 400       | 100         | $500            |
| 1000  | 800       | 200         | $1,000          |

To reach $1000/month, you need ~200 paying users.

## Marketing Ideas (Low Effort)

1. **SEO**: The app is pre-optimized for "bank statement analyzer", "expense tracker csv"
2. **Reddit**: Post once in r/personalfinance, r/ynab, r/budgeting
3. **Product Hunt**: Free listing, potential for organic traffic
4. **Twitter/X**: Share a screenshot of your own dashboard

## License

MIT
