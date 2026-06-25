# Deployment Guide — Land Plots Explorer

## Prerequisites

| Requirement | Version |
|---|---|
| .NET SDK | 10.0+ |
| OS | Windows / Linux / macOS |
| Google Maps API Key | Maps JavaScript API enabled |

---

## 1. Local Development

```bash
# Clone / copy the project
cd land_plots_explorer/LandPlotsExplorer

# Restore packages
dotnet restore

# Run in development
dotnet run
```

App will be available at `https://localhost:5001` (or the port shown in terminal).

---

## 2. Configuration

The Google Maps API key is stored in `appsettings.json`:

```json
{
  "GoogleMapsApiKey": "YOUR_KEY_HERE"
}
```

**For production**, never commit secrets to source control. Use one of:

- **Environment variable** (recommended):
  ```bash
  export GoogleMapsApiKey="YOUR_KEY_HERE"
  ```
- **User Secrets** (dev only):
  ```bash
  dotnet user-secrets set "GoogleMapsApiKey" "YOUR_KEY_HERE"
  ```
- **`appsettings.Production.json`** (excluded from git via `.gitignore`)

---

## 3. Publish a Self-Contained Build

### Windows (x64)
```bash
dotnet publish -c Release -r win-x64 --self-contained true -o ./publish
```

### Linux (x64)
```bash
dotnet publish -c Release -r linux-x64 --self-contained true -o ./publish
```

### Framework-Dependent (smaller, requires .NET on server)
```bash
dotnet publish -c Release -o ./publish
```

Output goes to `./publish/`. The `Data/plots.json` file is copied automatically (`PreserveNewest`).

---

## 4. Deploy to IIS (Windows Server)

### 4.1 Install Prerequisites
1. Install [.NET 10 Hosting Bundle](https://dotnet.microsoft.com/download/dotnet/10.0) on the server
2. Enable **IIS** via Windows Features → Internet Information Services

### 4.2 Publish & Copy
```bash
dotnet publish -c Release -o C:\inetpub\wwwroot\LandPlotsExplorer
```

### 4.3 Create IIS Site
1. Open **IIS Manager**
2. Right-click **Sites** → **Add Website**
3. Set **Physical path** to `C:\inetpub\wwwroot\LandPlotsExplorer`
4. Set **Application Pool** → change `.NET CLR version` to **No Managed Code**
5. Bind to desired port (e.g. 80)

### 4.4 Set Google Maps Key in IIS
In IIS Manager → select the site → **Configuration Editor** → `system.webServer/aspNetCore` → set environment variable `GoogleMapsApiKey`.

Or add to `web.config` (generated on publish):
```xml
<environmentVariables>
  <environmentVariable name="GoogleMapsApiKey" value="YOUR_KEY_HERE" />
</environmentVariables>
```

---

## 5. Deploy to Linux with systemd

### 5.1 Copy publish output
```bash
scp -r ./publish user@yourserver:/var/www/land-plots-explorer
```

### 5.2 Create systemd service
```ini
# /etc/systemd/system/land-plots.service

[Unit]
Description=Land Plots Explorer
After=network.target

[Service]
WorkingDirectory=/var/www/land-plots-explorer
ExecStart=/var/www/land-plots-explorer/LandPlotsExplorer
Restart=always
RestartSec=10
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://0.0.0.0:5000
Environment=GoogleMapsApiKey=YOUR_KEY_HERE
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable land-plots
sudo systemctl start land-plots
sudo systemctl status land-plots
```

### 5.3 Reverse Proxy with Nginx
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass         http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Deploy to Azure App Service

```bash
# Login
az login

# Create resource group & app service plan
az group create --name land-plots-rg --location eastus
az appservice plan create --name land-plots-plan --resource-group land-plots-rg --sku B1 --is-linux

# Create web app (.NET 10)
az webapp create --name land-plots-explorer --resource-group land-plots-rg \
  --plan land-plots-plan --runtime "DOTNETCORE:10.0"

# Set Google Maps key as app setting
az webapp config appsettings set --name land-plots-explorer \
  --resource-group land-plots-rg \
  --settings GoogleMapsApiKey="YOUR_KEY_HERE"

# Publish and deploy
dotnet publish -c Release -o ./publish
cd publish
zip -r ../deploy.zip .
az webapp deployment source config-zip --name land-plots-explorer \
  --resource-group land-plots-rg --src ../deploy.zip
```

---

## 7. Docker

```dockerfile
# Dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY LandPlotsExplorer/ .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "LandPlotsExplorer.dll"]
```

```bash
# Build image
docker build -t land-plots-explorer .

# Run
docker run -p 8080:8080 \
  -e GoogleMapsApiKey="YOUR_KEY_HERE" \
  land-plots-explorer
```

---

## 8. Security Checklist Before Go-Live

- [ ] Move `GoogleMapsApiKey` out of `appsettings.json` into environment variable or secret store
- [ ] Restrict the Google Maps API key to your domain in [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
- [ ] Enable HTTPS (Let's Encrypt via Certbot for Linux, or Azure managed cert)
- [ ] Set `ASPNETCORE_ENVIRONMENT=Production`
- [ ] Review `AllowedHosts` in `appsettings.json` — set to your domain instead of `*`

---

## 9. Verify Deployment

1. Open the app URL — the dashboard cards should load with plot counts
2. Click any card — map polygons should appear filtered by that status
3. Click a polygon — info window should show plot details
4. Test the filters sidebar — results count should update
5. Check browser console for any Google Maps API errors
