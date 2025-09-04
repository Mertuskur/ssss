const express = require('express');
const cors = require('cors');
const ScraperService = require('./scraperService');
const channelsConfig = require('../config/channels.json');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.API_PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Scraper service instance
let scraperService = null;

// Initialize scraper service
const initializeScraperService = () => {
  if (!scraperService) {
    scraperService = new ScraperService();
  }
  return scraperService;
};

// API Routes

// Get scraper status
app.get('/api/status', (req, res) => {
  try {
    const service = initializeScraperService();
    const stats = service.getStats();
    
    res.json({
      success: true,
      data: {
        isRunning: stats.isRunning,
        processedCount: stats.processedCount,
        connectedToTelegram: stats.connectedToTelegram,
        activeChannels: stats.activeChannels,
        uptime: process.uptime(),
        lastCheck: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Status alma hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Durum bilgisi alınamadı',
      error: error.message
    });
  }
});

// Start scraper
app.post('/api/start', async (req, res) => {
  try {
    const service = initializeScraperService();
    
    if (service.getStats().isRunning) {
      return res.json({
        success: false,
        message: 'Scraper zaten çalışıyor'
      });
    }
    
    await service.start();
    console.log('✅ Panel üzerinden scraper başlatıldı');
    
    res.json({
      success: true,
      message: 'Telegram scraper başarıyla başlatıldı',
      data: service.getStats()
    });
  } catch (error) {
    console.error('❌ Scraper başlatma hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Scraper başlatılamadı',
      error: error.message
    });
  }
});

// Stop scraper
app.post('/api/stop', async (req, res) => {
  try {
    const service = initializeScraperService();
    
    if (!service.getStats().isRunning) {
      return res.json({
        success: false,
        message: 'Scraper zaten durdurulmuş'
      });
    }
    
    await service.stop();
    console.log('⏹️ Panel üzerinden scraper durduruldu');
    
    res.json({
      success: true,
      message: 'Telegram scraper başarıyla durduruldu'
    });
  } catch (error) {
    console.error('❌ Scraper durdurma hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Scraper durdurulamadı',
      error: error.message
    });
  }
});

// Get current configuration
app.get('/api/config', async (req, res) => {
  try {
    const configPath = path.join(__dirname, '../config/channels.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('❌ Config alma hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Konfigürasyon alınamadı',
      error: error.message
    });
  }
});

// Update configuration
app.put('/api/config', async (req, res) => {
  try {
    const newConfig = req.body;
    const configPath = path.join(__dirname, '../config/channels.json');
    
    // Validate config structure
    if (!newConfig.channels || !Array.isArray(newConfig.channels)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz konfigürasyon formatı'
      });
    }
    
    // Save new config
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
    console.log('✅ Konfigürasyon panel üzerinden güncellendi');
    
    // Restart scraper if running to apply new config
    const service = initializeScraperService();
    if (service.getStats().isRunning) {
      console.log('🔄 Yeni ayarları uygulamak için scraper yeniden başlatılıyor...');
      await service.stop();
      await service.start();
    }
    
    res.json({
      success: true,
      message: 'Konfigürasyon başarıyla güncellendi',
      data: newConfig
    });
  } catch (error) {
    console.error('❌ Config güncelleme hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Konfigürasyon güncellenemedi',
      error: error.message
    });
  }
});

// Add source channel
app.post('/api/channels/source', async (req, res) => {
  try {
    const { name, username, description, active = true } = req.body;
    
    if (!name || !username) {
      return res.status(400).json({
        success: false,
        message: 'Kanal adı ve kullanıcı adı gerekli'
      });
    }
    
    const configPath = path.join(__dirname, '../config/channels.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    // Check if channel already exists
    const existingChannel = config.channels.find(ch => ch.username === username);
    if (existingChannel) {
      return res.status(400).json({
        success: false,
        message: 'Bu kanal zaten mevcut'
      });
    }
    
    // Add new channel
    const newChannel = {
      name,
      username: username.startsWith('@') ? username : `@${username}`,
      description,
      active
    };
    
    config.channels.push(newChannel);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    console.log(`✅ Yeni kaynak kanal eklendi: ${newChannel.username}`);
    
    res.json({
      success: true,
      message: 'Kaynak kanal başarıyla eklendi',
      data: newChannel
    });
  } catch (error) {
    console.error('❌ Kaynak kanal ekleme hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Kaynak kanal eklenemedi',
      error: error.message
    });
  }
});

// Add target group/channel
app.post('/api/channels/target', async (req, res) => {
  try {
    const { name, username, messageTemplate, active = true } = req.body;
    
    if (!name || !username) {
      return res.status(400).json({
        success: false,
        message: 'Grup adı ve kullanıcı adı gerekli'
      });
    }
    
    const configPath = path.join(__dirname, '../config/channels.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    // Check if target already exists
    const existingTarget = config.targetGroups.find(tg => tg.username === username);
    if (existingTarget) {
      return res.status(400).json({
        success: false,
        message: 'Bu hedef grup zaten mevcut'
      });
    }
    
    // Add new target group
    const newTarget = {
      name,
      username: username.startsWith('@') ? username : `@${username}`,
      messageTemplate: messageTemplate || config.targetGroups[0]?.messageTemplate || '🎰 **YENİ BONUS KODU!** 🎰\n\n💎 **Bonus Kodları:**\n{allBonusCodes}\n\n🔗 **Website:** {websiteUrl}',
      active
    };
    
    config.targetGroups.push(newTarget);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    console.log(`✅ Yeni hedef grup eklendi: ${newTarget.username}`);
    
    res.json({
      success: true,
      message: 'Hedef grup başarıyla eklendi',
      data: newTarget
    });
  } catch (error) {
    console.error('❌ Hedef grup ekleme hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Hedef grup eklenemedi',
      error: error.message
    });
  }
});

// Remove source channel
app.delete('/api/channels/source/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const configPath = path.join(__dirname, '../config/channels.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    const channelIndex = config.channels.findIndex(ch => ch.username === username || ch.username === `@${username}`);
    if (channelIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Kanal bulunamadı'
      });
    }
    
    const removedChannel = config.channels.splice(channelIndex, 1)[0];
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    console.log(`🗑️ Kaynak kanal silindi: ${removedChannel.username}`);
    
    res.json({
      success: true,
      message: 'Kaynak kanal başarıyla silindi'
    });
  } catch (error) {
    console.error('❌ Kaynak kanal silme hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Kaynak kanal silinemedi',
      error: error.message
    });
  }
});

// Remove target group
app.delete('/api/channels/target/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const configPath = path.join(__dirname, '../config/channels.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    const targetIndex = config.targetGroups.findIndex(tg => tg.username === username || tg.username === `@${username}`);
    if (targetIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Hedef grup bulunamadı'
      });
    }
    
    const removedTarget = config.targetGroups.splice(targetIndex, 1)[0];
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    console.log(`🗑️ Hedef grup silindi: ${removedTarget.username}`);
    
    res.json({
      success: true,
      message: 'Hedef grup başarıyla silindi'
    });
  } catch (error) {
    console.error('❌ Hedef grup silme hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Hedef grup silinemedi',
      error: error.message
    });
  }
});

// Get logs (last N entries)
app.get('/api/logs', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // In a real app, you'd read from log files
    // For now, return mock logs
    const logs = [
      { timestamp: new Date().toISOString(), level: 'info', message: 'Sistem başlatıldı' },
      { timestamp: new Date(Date.now() - 60000).toISOString(), level: 'success', message: '3 bonus kodu bulundu ve gönderildi' },
      { timestamp: new Date(Date.now() - 120000).toISOString(), level: 'info', message: 'Kanallar kontrol ediliyor...' }
    ].slice(0, limit);
    
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('❌ Log alma hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Loglar alınamadı',
      error: error.message
    });
  }
});

// Test connection
app.post('/api/test-connection', async (req, res) => {
  try {
    const service = initializeScraperService();
    
    // Test Telegram connection
    await service.telegramClient.connect();
    
    res.json({
      success: true,
      message: 'Telegram bağlantısı başarılı',
      data: {
        connected: true,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Bağlantı test hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Telegram bağlantısı başarısız',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ API Hatası:', err.message);
  res.status(500).json({
    success: false,
    message: 'Sunucu hatası',
    error: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint bulunamadı'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 Telegram Scraper API Başlatılıyor...');
  console.log(`📡 API Server: http://localhost:${PORT}`);
  console.log(`🔧 Panel Entegrasyonu: Aktif`);
  console.log('═'.repeat(50));
});

module.exports = app; 