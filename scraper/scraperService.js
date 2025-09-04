const TelegramClient = require('./telegramClient');
const RealTimeListener = require('./realTimeListener');
const MessageSender = require('./messageSender');
const Message = require('../shared/models/Message');
const channelsConfig = require('../config/channels.json');
const config = require('../config/env');

class ScraperService {
  constructor() {
    this.telegramClient = new TelegramClient();
    this.messageSender = new MessageSender(this.telegramClient);
    this.realTimeListener = new RealTimeListener(this.telegramClient, this.messageSender);
    this.isRunning = false;
    this.intervalId = null;
    this.processedCount = 0;
  }

  async start() {
    try {
      console.log('\n🚀 Telegram Bonus Scraper Başlatılıyor...');
      console.log(`📋 İzlenen Kanallar: ${channelsConfig.channels.length} adet`);
      
      // List channels being monitored
      channelsConfig.channels.forEach(channel => {
        console.log(`  📺 ${channel.name} (@${channel.username})`);
      });
      
      console.log(`⏰ Kontrol Aralığı: ${channelsConfig.settings.checkInterval / 1000} saniye`);
      console.log(`📅 Mesaj Süresi: Son ${channelsConfig.settings.maxAgeHours} saat`);
      console.log('═'.repeat(50));
      
      // Connect to Telegram
      await this.telegramClient.connect();
      
      // Initialize message sender
      await this.messageSender.initialize();
      
      // Start real-time listener
      await this.realTimeListener.start();
      
      this.isRunning = true;
      
      // Run initial scrape
      await this.scrapeAllChannels();
      
      // Set up interval for periodic scraping (as backup)
      this.intervalId = setInterval(async () => {
        if (this.isRunning) {
          await this.scrapeAllChannels();
        }
      }, channelsConfig.settings.checkInterval);
      
      console.log(`\n✅ Sistem başarıyla çalışıyor!`);
      
    } catch (error) {
      console.error('❌ Sistem başlatılamadı:', error.message);
      throw error;
    }
  }

  async stop() {
    console.log('🛑 Sistem durduruluyor...');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Stop real-time listener
    await this.realTimeListener.stop();
    
    // Stop message sender
    await this.messageSender.stop();
    
    // Disconnect from Telegram
    await this.telegramClient.disconnect();
    
    console.log('✅ Sistem tamamen durduruldu');
  }

  async scrapeAllChannels() {
    console.log(`\n🔍 ${new Date().toLocaleString('tr-TR')} - Kontrol başlıyor...`);
    
    let totalBonusFound = 0;
    const activeChannels = channelsConfig.channels.filter(channel => channel.active);
    
    for (const channel of activeChannels) {
      try {
        const result = await this.scrapeChannel(channel);
        if (result > 0) totalBonusFound++;
        
        // Add delay between channels to avoid flood limits
        await this.sleep(2000);
        
      } catch (error) {
        console.error(`❌ ${channel.name} - Hata: ${error.message}`);
        
        // If it's a flood wait, wait longer before next channel
        if (error.message.includes('FLOOD_WAIT')) {
          const waitTime = this.extractFloodWaitTime(error.message);
          console.log(`⏳ Flood limit - ${waitTime} saniye bekleniyor...`);
          await this.sleep(waitTime * 1000);
        }
      }
    }

    if (totalBonusFound > 0) {
      console.log(`\n🎉 Toplam ${totalBonusFound} kanaldan bonus kodu bulundu!`);
    } else {
      console.log(`\n📊 Tüm kanallar kontrol edildi - Yeni bonus kodu bulunamadı`);
    }
    
    console.log(`⏳ ${channelsConfig.settings.checkInterval / 1000} saniye sonra tekrar kontrol...`);
  }

  async scrapeChannel(channelConfig) {
    try {
      console.log(`📡 ${channelConfig.name} - Son günün mesajları kontrol ediliyor...`);
      
      // Fetch messages from Telegram (latest first)
      const messages = await this.telegramClient.getChannelMessages(
        channelConfig.username,
        channelsConfig.settings.maxMessagesPerCheck,
        0  // No offset = get latest messages
      );

      if (!messages || messages.length === 0) {
        console.log(`❌ ${channelConfig.name} - Mesaj bulunamadı`);
        return 0;
      }

      // Filter messages by date (last 24 hours)
      const oneDayAgo = new Date(Date.now() - (channelsConfig.settings.maxAgeHours * 60 * 60 * 1000));
      const recentMessages = messages.filter(msg => {
        const messageDate = new Date(msg.date * 1000);
        return messageDate > oneDayAgo;
      });

      if (recentMessages.length === 0) {
        console.log(`⏰ ${channelConfig.name} - Son 24 saatte mesaj yok`);
        return 0;
      }

      console.log(`📊 ${channelConfig.name} - ${recentMessages.length} mesaj kontrol ediliyor...`);

      let newMessageCount = 0;
      let bonusFoundCount = 0;
      
      // Process messages in batches
      for (let i = 0; i < recentMessages.length; i += config.scraping.batchSize) {
        const batch = recentMessages.slice(i, i + config.scraping.batchSize);
        const result = await this.processMessageBatch(batch, channelConfig);
        newMessageCount += batch.length;
        bonusFoundCount += result.bonusCount;
      }

      if (bonusFoundCount > 0) {
        console.log(`✅ ${channelConfig.name} - ${bonusFoundCount} bonus kodu bulundu ve gönderildi!`);
      } else {
        console.log(`📝 ${channelConfig.name} - ${newMessageCount} mesaj incelendi, bonus kodu bulunamadı`);
      }
      
      this.processedCount += newMessageCount;
      return newMessageCount;

    } catch (error) {
      console.error(`Error scraping channel ${channelConfig.username}:`, error.message);
      throw error;
    }
  }

  async processMessageBatch(messages, channelConfig) {
    const messagePromises = messages.map(msg => this.processMessage(msg, channelConfig));
    const results = await Promise.allSettled(messagePromises);
    
    // Count bonus messages found
    const bonusCount = results.filter(result => 
      result.status === 'fulfilled' && result.value === 'bonus_sent'
    ).length;
    
    return { bonusCount };
  }

  async processMessage(telegramMessage, channelConfig) {
    try {
      // Skip if message has no text
      if (!telegramMessage.text) {
        return;
      }

      // Check if this message already exists in database
      const existingMessage = await Message.findOne({
        messageId: telegramMessage.id,
        channelUsername: channelConfig.username
      });

      if (existingMessage) {
        // If it exists and has bonus/website but not processed, process it
        if (existingMessage.hasBonus && existingMessage.hasWebsite && !existingMessage.processed) {
          if (this.shouldSendToGroups(existingMessage)) {
            await this.messageSender.sendToTargetGroups(existingMessage);
            existingMessage.processed = true;
            await existingMessage.save();
            return 'bonus_sent';
          }
        }
        return; // Skip already processed messages
      }

      // Check if message matches bonus code format (short message with codes and URL)
      const lines = telegramMessage.text.trim().split('\n').filter(line => line.trim().length > 0);
      
      // Must have 2-5 lines total (not too long, not too short)
      if (lines.length < 2 || lines.length > 5) {
        return;
      }
      
      // Must contain at least one URL
      const hasUrl = lines.some(line => 
        line.includes('http') || line.includes('.com') || line.includes('.net') || line.includes('.org')
      );
      
      if (!hasUrl) {
        return;
      }

      // Create message document
      const messageDoc = new Message({
        messageId: telegramMessage.id,
        channelId: telegramMessage.peerId?.channelId?.toString() || 'unknown',
        channelUsername: channelConfig.username,
        channelName: channelConfig.name,
        text: telegramMessage.text,
        rawMessage: {
          id: telegramMessage.id,
          date: telegramMessage.date,
          fromId: telegramMessage.fromId,
          views: telegramMessage.views,
          forwards: telegramMessage.forwards
        },
        matchedKeywords: ['bonus_format'], // Format-based detection
        messageDate: new Date(telegramMessage.date * 1000), // Convert Unix timestamp
        processed: false
      });

      // Extract bonus codes and websites
      messageDoc.extractData();

      // Save to database
      await messageDoc.save();
      
      // Send to target groups if conditions are met
      if (this.shouldSendToGroups(messageDoc)) {
        await this.messageSender.sendToTargetGroups(messageDoc);
        
        // Mark as processed to avoid duplicate sending
        messageDoc.processed = true;
        await messageDoc.save();
        return 'bonus_sent';
      }

    } catch (error) {
      // Handle duplicate key error (message already exists)
      if (error.code === 11000) {
        // Message already exists, skip silently
        return;
      }
      
      console.error(`Error processing message ${telegramMessage.id}:`, error.message);
    }
  }

  extractFloodWaitTime(errorMessage) {
    const match = errorMessage.match(/FLOOD_WAIT_(\d+)/);
    return match ? parseInt(match[1]) : 60;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  shouldSendToGroups(messageDoc) {
    // Must have both bonus code and website for sending
    if (!messageDoc.hasBonus || !messageDoc.hasWebsite) {
      return false;
    }

    // Bonus code must be valid (not empty, not null)
    if (!messageDoc.bonusCode || messageDoc.bonusCode.trim().length < 4) {
      return false;
    }

    // Website must be valid
    if (!messageDoc.websiteUrl || !messageDoc.websiteUrl.startsWith('http')) {
      return false;
    }

    return true;
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      connectedToTelegram: this.telegramClient.isClientConnected(),
      activeChannels: channelsConfig.channels.filter(c => c.active).length,
      realTimeListener: this.realTimeListener.getStatus(),
      messageSender: this.messageSender.getStats()
    };
  }

  // Additional methods for real-time features
  async sendTestMessage(groupId, message) {
    return await this.messageSender.sendTestMessage(groupId, message);
  }

  getRealTimeStatus() {
    return this.realTimeListener.getStatus();
  }

  getMessagingStats() {
    return this.messageSender.getStats();
  }

  clearMessageQueue() {
    this.messageSender.clearQueue();
  }

  async sendLatestBonusMessage() {
    try {
      console.log('\n🚀 Sending latest bonus message for testing...');
      
      // Find the latest message with both bonus and website
      const latestMessage = await Message.findOne({
        hasBonus: true,
        hasWebsite: true
      }).sort({ messageDate: -1 });

      if (latestMessage) {
        console.log(`Found latest bonus message: ${latestMessage.bonusCode}`);
        console.log(`Website: ${latestMessage.websiteUrl}`);
        
        // Force send this message
        await this.messageSender.sendToTargetGroups(latestMessage);
        console.log('✅ Test message sent!');
      } else {
        console.log('❌ No bonus messages found in database');
      }
    } catch (error) {
      console.error('❌ Error sending test message:', error.message);
    }
  }
}

module.exports = ScraperService; 