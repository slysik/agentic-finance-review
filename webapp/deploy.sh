#!/bin/bash

# FinanceDash - Deploy to Vercel Script
# This script pushes to GitHub and deploys to Vercel

set -e

echo "🚀 FinanceDash - Deploying to Vercel"
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

# Check if this is a git repo
if [ ! -d ".git" ]; then
    echo "📁 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit - FinanceDash SaaS"
fi

# Deploy to Vercel
echo ""
echo "🌐 Deploying to Vercel..."
echo "   (You'll be prompted to log in if not already)"
echo ""

vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Your app is now live at the URL shown above"
echo "2. To enable payments, add Stripe keys in Vercel Environment Variables"
echo "3. Share your URL to get users!"
