# 🚀 Vaidic Sanskar Admin Suite — Render Deployment Guide

Yeh guide aapko **Vaidic Sanskar Backend API + Admin Console** ko **Render** par live host karne ke poore steps batati hai.

---

## 📋 Step 0: MongoDB Atlas IP Access (Bahut Zaroori)

Render ke servers cloud me dynamic IP use karte hain. Agar MongoDB Atlas me Render ka IP allow nahi hoga to database connect nahi hoga.

1. **[cloud.mongodb.com](https://cloud.mongodb.com/)** par login karein.
2. Left menu me **Security** → **Network Access** par jayein.
3. **+ ADD IP ADDRESS** button par click karein.
4. **ALLOW ACCESS FROM ANYWHERE** (`0.0.0.0/0`) select karein.
5. **Confirm** karein (1-2 minute me activate ho jata hai).

---

## ⚡ Step 1: Render Par Deploy Kaise Karein (2 Simple Options)

Aapka GitHub repo ready aur latest push ho chuka hai:
👉 `https://github.com/sratanshu007/vaidic-sanskar-admin-suite`

### Option 1: 1-Click Blueprint (Recommended & Fast)

Repo me `render.yaml` already add kar diya gaya hai.

1. **[dashboard.render.com](https://dashboard.render.com/)** par login karein.
2. Top-right me **New +** par click karein → **Blueprint** select karein.
3. GitHub repo select karein: `vaidic-sanskar-admin-suite`.
4. Render automatic `render.yaml` se saare settings pick kar lega.
5. Screen par aane wale Environment Variables (e.g., `MONGODB_URI`, `CLOUDINARY_*`, `ADMIN_PASSWORD`) fill karein aur **Apply** click karein.

---

### Option 2: Manual Web Service Setup

Agar aap step-by-step manually setup karna chahte hain:

1. **[dashboard.render.com](https://dashboard.render.com/)** par jayein.
2. Click karein **New +** → **Web Service**.
3. **Build and deploy from a Git repository** choose karein.
4. GitHub repo select karein: `sratanshu007/vaidic-sanskar-admin-suite`.
5. Ye settings enter karein:
   - **Name**: `vaidic-sanskar-backend` (ya apni pasand ka koi bhi naam)
   - **Region**: `Singapore` (India ke users ke liye best speed)
   - **Branch**: `main`
   - **Root Directory**: *(Khali chhod dein)*
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

---

## 🔑 Step 2: Environment Variables Set Karein

Render Dashboard me **Environment Variables** section me jakar ye key-values add karein (aapke local `.env` se):

| Key | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Production environment |
| `CORS_ORIGIN` | `*` | Mobile apps aur admin panel allow karne ke liye |
| `JWT_SECRET` | *(Aapka secret key)* | Token generation ke liye |
| `ADMIN_EMAIL` | `admin@vaidicsanskar.com` | Admin login email |
| `ADMIN_PASSWORD` | *(Aapka secure password)* | Admin login password |
| `MONGODB_URI` | `mongodb+srv://...` | MongoDB Atlas live database connection string |
| `CLOUDINARY_CLOUD_NAME` | *(Cloudinary Name)* | Photo uploads ke liye |
| `CLOUDINARY_API_KEY` | *(Cloudinary Key)* | |
| `CLOUDINARY_API_SECRET` | *(Cloudinary Secret)* | |
| `SMTP_HOST` | `smtp.gmail.com` | Email OTP ke liye |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | *(Aapka Gmail)* | |
| `SMTP_PASS` | *(Gmail 16-digit App Password)* | |
| `EMAIL_FROM` | `"Vaidic Sanskar" <your@gmail.com>` | |
| `AGORA_APP_ID` | *(Agora App ID)* | Audio/Video calling |
| `EXPO_PUBLIC_AGORA_APP_ID`| *(Agora App ID)* | |
| `EXPO_PUBLIC_MAPPLS_REST_KEY` | *(Mappls Key)* | Live tracking maps |
| `EXPO_PUBLIC_MAPPLS_CLIENT_ID`| *(Mappls Client ID)* | |
| `EXPO_PUBLIC_MAPPLS_CLIENT_SECRET`| *(Mappls Secret)* | |

---

## 🩺 Step 3: Health Check Configure Karein

1. Render Service page me **Settings** me jayein.
2. **Health Check Path** me type karein:
   ```
   /api/health
   ```
3. Save changes karein.

---

## ✅ Step 4: Verification & Test

Jab deployment complete ho jaye (`Live` status show kare):

1. **Backend Health Check**:
   ```
   https://<your-service-name>.onrender.com/api/health
   ```
   Output: `{"ok":true,"ts":1730...}`

2. **Admin Panel**:
   ```
   https://<your-service-name>.onrender.com/admin
   ```
   Yahan aapka admin dashboard login page ke sath open hoga!

---

## 📱 Step 5: Mobile Apps Ko Render URL Se Connect Karein

Backend live hone ke baad, mobile apps (`VaidicSanskar-v2` aur `VaidicSanskarPartner`) ke `.env` me Render ka URL daal dein:

```env
EXPO_PUBLIC_API_URL=https://<your-service-name>.onrender.com
EXPO_PUBLIC_SOCKET_URL=https://<your-service-name>.onrender.com
```

---

## 💡 Pro-Tip: Free Tier Ko 24/7 Active Rakhna

Render Free tier 15 minutes inactive rehne par sleep ho jata hai. Isko 24/7 awake rakhne ke liye:
1. **[cron-job.org](https://cron-job.org/)** ya **[uptimerobot.com](https://uptimerobot.com/)** par free account banayein.
2. Monitor URL set karein: `https://<your-service-name>.onrender.com/api/health`
3. Interval: Har **10 minutes**
Isse aapka backend hamesha active rahega bina kisi sleep delay ke!

