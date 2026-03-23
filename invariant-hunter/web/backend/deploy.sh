#!/bin/bash
# =============================================================================
# Invariant Hunter Backend - Linux Server Deployment Script
# Server: 85.206.161.250 (32881-63176.bacloud.info)
# =============================================================================

set -e  # Exit on error

echo "=========================================="
echo "  Invariant Hunter Backend Deployment"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/opt/invariant-hunter"
APP_USER="hunter"
NODE_VERSION="20"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo ./deploy.sh)${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: System Update${NC}"
apt update && apt upgrade -y

echo -e "${YELLOW}Step 2: Install Dependencies${NC}"
apt install -y curl git build-essential

echo -e "${YELLOW}Step 3: Install Node.js ${NODE_VERSION}${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
fi
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

echo -e "${YELLOW}Step 4: Install pnpm (for projects that use it)${NC}"
npm install -g pnpm

echo -e "${YELLOW}Step 5: Install Foundry${NC}"
if ! command -v forge &> /dev/null; then
    # Install for root first, then for app user
    curl -L https://foundry.paradigm.xyz | bash
    source ~/.bashrc
    ~/.foundry/bin/foundryup
fi

echo -e "${YELLOW}Step 6: Create Application User${NC}"
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash $APP_USER
    echo "Created user: $APP_USER"
fi

# Install Foundry for app user
sudo -u $APP_USER bash -c 'curl -L https://foundry.paradigm.xyz | bash'
sudo -u $APP_USER bash -c 'source ~/.bashrc && ~/.foundry/bin/foundryup'

echo -e "${YELLOW}Step 7: Create Application Directory${NC}"
mkdir -p $APP_DIR
chown -R $APP_USER:$APP_USER $APP_DIR

echo -e "${YELLOW}Step 8: Install PM2 (Process Manager)${NC}"
npm install -g pm2

echo -e "${YELLOW}Step 9: Setup Firewall${NC}"
ufw allow 22/tcp    # SSH
ufw allow 4000/tcp  # Backend API
ufw allow 80/tcp    # HTTP (optional, for reverse proxy)
ufw allow 443/tcp   # HTTPS (optional, for reverse proxy)
ufw --force enable

echo -e "${GREEN}=========================================="
echo "  Base Setup Complete!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Copy the backend code to the server:"
echo "   scp -r ./backend/* root@85.206.161.250:$APP_DIR/"
echo ""
echo "2. SSH into the server and run:"
echo "   cd $APP_DIR"
echo "   npm install"
echo "   npm run build"
echo "   pm2 start dist/index.js --name invariant-hunter"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "3. Update your frontend .env.local:"
echo "   NEXT_PUBLIC_API_URL=http://85.206.161.250:4000/api"
echo ""
