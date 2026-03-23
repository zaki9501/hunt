# Deploy Invariant Hunter Backend to Linux Server

## Server Details
- **Hostname**: 32881-63176.bacloud.info
- **IP**: 85.206.161.250
- **OS**: Ubuntu 24.04 LTS
- **Specs**: Ryzen 9 7950X3D, 128GB RAM, 2x1.92TB NVMe

## Quick Deploy (Copy & Paste)

### Step 1: SSH into your server
```bash
ssh root@85.206.161.250
```

### Step 2: Run setup script (one command)
```bash
# Install everything in one go
apt update && apt upgrade -y && \
apt install -y curl git build-essential && \
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
apt install -y nodejs && \
npm install -g pnpm pm2 && \
curl -L https://foundry.paradigm.xyz | bash && \
source ~/.bashrc && \
~/.foundry/bin/foundryup
```

### Step 3: Create app directory
```bash
mkdir -p /opt/invariant-hunter
mkdir -p /var/log/invariant-hunter
cd /opt/invariant-hunter
```

### Step 4: Copy backend code from your Windows PC
Open a NEW terminal on Windows (PowerShell) and run:
```powershell
# From your project directory
cd "c:\Users\zakia\OneDrive\Documents\projects\hunt\invariant-hunter\web\backend"

# Copy all backend files (excluding node_modules)
scp -r src package.json tsconfig.json ecosystem.config.js root@85.206.161.250:/opt/invariant-hunter/
```

### Step 5: Back on the Linux server, install and build
```bash
cd /opt/invariant-hunter
npm install
npm run build
```

### Step 6: Start the backend with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the instructions it prints
```

### Step 7: Verify it's running
```bash
pm2 status
curl http://localhost:4000/api/jobs
```

### Step 8: Open firewall
```bash
ufw allow 22/tcp
ufw allow 4000/tcp
ufw --force enable
```

---

## Update Frontend to Use Linux Backend

On your Windows PC, update the frontend environment:

### Option A: Create/edit `.env.local` in frontend folder
```
NEXT_PUBLIC_API_URL=http://85.206.161.250:4000/api
```

### Option B: Or set it when running
```bash
NEXT_PUBLIC_API_URL=http://85.206.161.250:4000/api npm run dev
```

---

## Useful Commands

### View logs
```bash
pm2 logs invariant-hunter-api
pm2 logs invariant-hunter-api --lines 100
```

### Restart backend
```bash
pm2 restart invariant-hunter-api
```

### Update backend code
```bash
cd /opt/invariant-hunter
# Pull new code or scp again
npm run build
pm2 restart invariant-hunter-api
```

### Check Foundry
```bash
forge --version
```

### Monitor resources
```bash
htop
pm2 monit
```

---

## Security (Optional but Recommended)

### 1. Create non-root user
```bash
useradd -m -s /bin/bash hunter
chown -R hunter:hunter /opt/invariant-hunter
# Then run PM2 as hunter user
```

### 2. Setup nginx reverse proxy (for HTTPS)
```bash
apt install nginx certbot python3-certbot-nginx
# Configure nginx to proxy 80/443 -> 4000
```

### 3. Restrict API access
Edit backend to only accept requests from your frontend domain.

---

## Troubleshooting

### "forge: command not found"
```bash
source ~/.bashrc
# Or add to PATH permanently:
echo 'export PATH="$HOME/.foundry/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### PM2 not starting on reboot
```bash
pm2 startup
# Copy and run the command it outputs
pm2 save
```

### Can't connect from frontend
1. Check firewall: `ufw status`
2. Check PM2: `pm2 status`
3. Check logs: `pm2 logs`
4. Test locally: `curl http://localhost:4000/api/jobs`

### Out of memory during fuzzing
```bash
# Check memory
free -h
# Increase swap if needed
fallocate -l 8G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```
