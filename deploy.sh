#!/bin/bash

# Simple deployment script for King of Night Backend
echo "🚀 Deploying King of Night Backend..."

# Create logs directory
mkdir -p logs

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building project..."
npm run build

# Generate Prisma client
echo "🗄️ Generating Prisma client..."
npx prisma generate

# Push database schema
echo "📊 Updating database schema..."
npx prisma db push

# Restart PM2 process
echo "🔄 Restarting application..."
pm2 restart king-of-night-backend || pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

echo "✅ Deployment completed!"
echo "📊 Check status: pm2 status"
echo "📝 View logs: pm2 logs king-of-night-backend"
