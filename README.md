# Telegram Scraper

Modern Telegram kanal mesajlarını otomatik çeken ve MongoDB'ye kaydeden real-time sistem.

## 🎯 Özellikler

- ✅ **Real-time mesaj dinleme** - WebSocket benzeri anlık mesaj yakalama
- ✅ **Otomatik bonus kodu çıkarma** - Mesajlardan bonus kodlarını otomatik bulma  
- ✅ **Website URL tespiti** - Mesajlardaki linkleri otomatik çıkarma
- ✅ **Dinamik kanal konfigürasyonu** - Kod değişikliği olmadan kanal yönetimi
- ✅ **Hedef grup mesajlaşması** - Bulunan bonus kodlarını otomatik gruplara gönderme
- ✅ **Flood limit koruması** - Telegram rate limit'lerini otomatik yönetim
- ✅ **MongoDB entegrasyonu** - Tüm mesajları veritabanında saklama
- ✅ **Graceful shutdown** - Güvenli kapanma ve restart

## 🏗️ Proje Yapısı

```
├── config/
│   ├── channels.json      # Kanal ve grup konfigürasyonu
│   └── env.js            # Environment ayarları
├── scraper/
│   ├── index.js          # Ana uygulama
│   ├── telegramClient.js # Telegram bağlantı yönetimi
│   ├── scraperService.js # Ana scraping servisi
│   ├── realTimeListener.js # Real-time mesaj dinleyici
│   └── messageSender.js  # Grup mesajlaşma sistemi
├── shared/
│   ├── database.js       # MongoDB bağlantı yönetimi
│   └── models/
│       └── Message.js    # Mesaj veritabanı modeli
└── panel/               # Web panel (gelecekte)
```

## 🚀 Kurulum

### 1. Bağımlılıkları Yükle

```bash
npm install
```

### 2. Environment Dosyası Oluştur

```bash
cp env.template .env
```

`.env` dosyasını düzenleyip Telegram API bilgilerini girin:

```env
MONGODB_URI=mongodb://localhost:27017/Apibet
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash  
TELEGRAM_SESSION=your_session_string
```

### 3. MongoDB Başlat

MongoDB'nin çalıştığından emin olun:

```bash
# Windows
net start MongoDB

# Linux/Mac
sudo systemctl start mongod
```

### 4. Konfigürasyonu Düzenle

`config/channels.json` dosyasında:

- **İzlenecek kanalları** ekleyin/düzenleyin
- **Hedef grupları** belirleyin  
- **Mesaj template'lerini** özelleştirin

## ▶️ Çalıştırma

### Production Modu
```bash
npm start
```

### Development Modu (otomatik restart)
```bash
npm run dev
```

## ⚙️ Konfigürasyon

### Kanal Ayarları (`config/channels.json`)

```json
{
  "channels": [
    {
      "id": "kanal1",
      "name": "Bonus Kanalı",
      "username": "@bonuskanali",
      "active": true,
      "keywords": ["bonus", "kod", "casino"],
      "realTimeEnabled": true
    }
  ],
  "targetGroups": [
    {
      "id": "group1", 
      "name": "Bildirim Grubu",
      "username": "@bildirimgrubu",
      "active": true,
      "messageTemplate": "🎰 Yeni Bonus!\n💰 {bonusCode}\n🌐 {websiteUrl}"
    }
  ]
}
```

### Mesaj Template Değişkenleri

- `{channelName}` - Kanal adı
- `{bonusCode}` - Bulunan bonus kodu
- `{websiteUrl}` - Bulunan website URL'i
- `{messageText}` - Orijinal mesaj metni
- `{messageDate}` - Mesaj tarihi
- `{keywords}` - Eşleşen anahtar kelimeler

## 🔧 API Bilgileri

### Telegram API

1. https://my.telegram.org adresine gidin
2. API ID ve API Hash alın
3. Session string'i oluşturun (telegram library ile)

### MongoDB Schema

Mesajlar şu yapıda saklanır:

```javascript
{
  messageId: Number,
  channelId: String,
  channelUsername: String,
  channelName: String,
  text: String,
  bonusCode: String,      // Otomatik çıkarılan
  websiteUrl: String,     // Otomatik çıkarılan
  matchedKeywords: [String],
  messageDate: Date,
  scrapedAt: Date,
  hasBonus: Boolean,
  hasWebsite: Boolean
}
```

## 📊 Monitoring

Uygulama çalışırken detaylı loglar verir:

```
🚀 Starting Telegram Scraper Application...
✅ MongoDB connected successfully
✅ Telegram client connected successfully
✅ Message sender initialized successfully
✅ Real-time listener started successfully
📡 Monitoring 2 channels in real-time
📤 Message sender: 2 target groups
```

## 🛠️ Komutlar

```bash
# Uygulamayı başlat
npm start

# Development modu (nodemon ile)
npm run dev

# Sadece scraper'ı çalıştır
npm run scraper
```

## 🔒 Güvenlik

- API anahtarları `.env` dosyasında saklanır
- `.env` dosyası `.gitignore`'da listelenir
- Rate limiting otomatik yönetilir
- Graceful shutdown desteği

## 🚧 Gelecek Özellikler

- [ ] Web panel arayüzü
- [ ] Mesaj filtreleme kuralları
- [ ] Webhook desteği
- [ ] Detaylı istatistikler
- [ ] Multi-account desteği

## 📝 Notlar

- Telegram flood limit'lerine dikkat edin
- MongoDB bağlantısını düzenli kontrol edin
- Log dosyalarını periyodik temizleyin
- Backup stratejinizi belirleyin

## 🆘 Sorun Giderme

### Bağlantı Sorunları
```bash
# Telegram bağlantısını test et
node -e "console.log('Testing connection...')"
```

### MongoDB Sorunları
```bash
# MongoDB durumunu kontrol et
mongosh --eval "db.adminCommand('ping')"
```

### Log Seviyeleri
```env
LOG_LEVEL=debug  # Detaylı loglar için
``` 