const { NewMessage } = require('telegram/events');
const Message = require('../shared/models/Message');
const channelsConfig = require('../config/channels.json');

class RealTimeListener {
  constructor(telegramClient, messageSender) {
    this.telegramClient = telegramClient;
    this.messageSender = messageSender;
    this.isListening = false;
    this.channelEntities = new Map();
    this.heartbeatInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = channelsConfig.settings.realTime.maxReconnectAttempts;
  }

  async start() {
    try {
      if (!channelsConfig.settings.realTime.enabled) {
        console.log('Real-time listening is disabled in config');
        return;
      }

      console.log('🔄 Starting real-time message listener...');
      
      // Ensure Telegram client is connected
      if (!this.telegramClient.isClientConnected()) {
        await this.telegramClient.connect();
      }

      // Get channel entities for real-time listening
      await this.loadChannelEntities();

      // Set up event handler for new messages
      this.telegramClient.client.addEventHandler(
        this.handleNewMessage.bind(this),
        new NewMessage({})
      );

      this.isListening = true;
      this.reconnectAttempts = 0;

      // Start heartbeat to keep connection alive
      this.startHeartbeat();

      console.log('✅ Real-time listener started successfully');
      console.log(`📡 Monitoring ${this.channelEntities.size} channels in real-time`);

    } catch (error) {
      console.error('❌ Failed to start real-time listener:', error.message);
      await this.handleReconnect();
    }
  }

  async loadChannelEntities() {
    const activeChannels = channelsConfig.channels.filter(
      channel => channel.active && channel.realTimeEnabled
    );

    console.log(`Loading ${activeChannels.length} channel entities...`);

    for (const channel of activeChannels) {
      try {
        const entity = await this.telegramClient.getChannelEntity(channel.username);
        this.channelEntities.set(entity.id.toString(), {
          entity,
          config: channel
        });
        console.log(`✓ Loaded entity for ${channel.name}`);
      } catch (error) {
        console.error(`❌ Failed to load entity for ${channel.username}:`, error.message);
      }
    }
  }

  async handleNewMessage(event) {
    try {
      const message = event.message;
      
      // Skip if no text
      if (!message.text) {
        return;
      }

      // Check if message is from one of our monitored channels
      const channelId = message.peerId?.channelId?.toString();
      if (!channelId || !this.channelEntities.has(channelId)) {
        return;
      }

      const channelData = this.channelEntities.get(channelId);
      const channelConfig = channelData.config;

      console.log(`📨 New real-time message from ${channelConfig.name}: ${message.id}`);

      // Check if message contains target keywords
      const messageText = message.text.toLowerCase();
      const matchedKeywords = channelConfig.keywords.filter(keyword => 
        messageText.includes(keyword.toLowerCase())
      );

      if (matchedKeywords.length === 0) {
        console.log(`⏭️ Message ${message.id} doesn't contain target keywords`);
        return;
      }

      // Process the message
      await this.processRealTimeMessage(message, channelConfig, matchedKeywords);

    } catch (error) {
      console.error('❌ Error handling real-time message:', error.message);
    }
  }

  async processRealTimeMessage(telegramMessage, channelConfig, matchedKeywords) {
    try {
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
        matchedKeywords: matchedKeywords,
        messageDate: new Date(telegramMessage.date * 1000),
        processed: false
      });

      // Extract bonus codes and websites
      messageDoc.extractData();

      // Save to database
      await messageDoc.save();
      
      console.log(`✅ Real-time message saved: ${telegramMessage.id} from ${channelConfig.username}`);
      
      // Log extracted data
      if (messageDoc.hasBonus) {
        console.log(`  💰 Bonus code: ${messageDoc.bonusCode}`);
      }
      if (messageDoc.hasWebsite) {
        console.log(`  🌐 Website: ${messageDoc.websiteUrl}`);
      }

      // Send to target groups if conditions are met
      if (this.shouldSendToGroups(messageDoc)) {
        await this.messageSender.sendToTargetGroups(messageDoc);
      }

    } catch (error) {
      // Handle duplicate key error (message already exists)
      if (error.code === 11000) {
        console.log(`⚠️ Message ${telegramMessage.id} already exists in database`);
        return;
      }
      
      console.error(`❌ Error processing real-time message ${telegramMessage.id}:`, error.message);
    }
  }

  shouldSendToGroups(messageDoc) {
    const settings = channelsConfig.settings.messaging;
    
    // Check if we only send messages with bonus codes
    if (settings.onlyWithBonusCode && !messageDoc.hasBonus) {
      return false;
    }

    // Check minimum message length
    if (messageDoc.text.length < settings.minMessageLength) {
      return false;
    }

    return true;
  }

  startHeartbeat() {
    const interval = channelsConfig.settings.realTime.heartbeatInterval;
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (this.isListening && this.telegramClient.isClientConnected()) {
          // Simple ping to keep connection alive
          console.log('💓 Heartbeat - Connection alive');
        } else {
          console.log('⚠️ Connection lost, attempting reconnect...');
          await this.handleReconnect();
        }
      } catch (error) {
        console.error('❌ Heartbeat error:', error.message);
        await this.handleReconnect();
      }
    }, interval);
  }

  async handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached. Stopping real-time listener.');
      await this.stop();
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    await this.sleep(channelsConfig.settings.realTime.reconnectDelay);
    
    try {
      await this.stop();
      await this.start();
    } catch (error) {
      console.error('❌ Reconnection failed:', error.message);
      setTimeout(() => this.handleReconnect(), channelsConfig.settings.realTime.reconnectDelay);
    }
  }

  async stop() {
    console.log('🛑 Stopping real-time listener...');
    
    this.isListening = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Remove event handlers
    if (this.telegramClient.client) {
      // Note: Telegram client doesn't have a direct way to remove specific handlers
      // This is handled by the client's internal cleanup
    }

    this.channelEntities.clear();
    console.log('✅ Real-time listener stopped');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      isListening: this.isListening,
      monitoredChannels: this.channelEntities.size,
      reconnectAttempts: this.reconnectAttempts,
      heartbeatActive: !!this.heartbeatInterval
    };
  }
}

module.exports = RealTimeListener; 