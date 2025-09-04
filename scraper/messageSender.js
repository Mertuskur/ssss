const channelsConfig = require('../config/channels.json');

class MessageSender {
  constructor(telegramClient) {
    this.telegramClient = telegramClient;
    this.groupEntities = new Map();
    this.sendQueue = [];
    this.isProcessingQueue = false;
    this.sentCount = 0;
  }

  async initialize() {
    try {
      console.log('🔄 Initializing message sender...');
      
      // Load target group entities
      await this.loadGroupEntities();
      
      // Start processing queue
      this.startQueueProcessor();
      
      console.log('✅ Message sender initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize message sender:', error.message);
      throw error;
    }
  }

  async loadGroupEntities() {
    const activeGroups = channelsConfig.targetGroups.filter(group => group.active);
    
    console.log(`Loading ${activeGroups.length} target group entities...`);

    for (const group of activeGroups) {
      try {
        const entity = await this.telegramClient.getChannelEntity(group.username);
        this.groupEntities.set(group.id, {
          entity,
          config: group
        });
        console.log(`✓ Loaded entity for ${group.name}`);
      } catch (error) {
        console.error(`❌ Failed to load entity for ${group.username}:`, error.message);
      }
    }
  }

  async sendToTargetGroups(messageDoc) {
    try {
      const activeGroups = Array.from(this.groupEntities.values())
        .filter(groupData => groupData.config.active);

      if (activeGroups.length === 0) {
        console.log('⚠️ No active target groups configured');
        return;
      }

      console.log(`📤 Queuing message to ${activeGroups.length} target groups`);

      // Add to queue for each target group
      for (const groupData of activeGroups) {
        const formattedMessage = this.formatMessage(messageDoc, groupData.config);
        
        this.sendQueue.push({
          groupData,
          message: formattedMessage,
          originalMessage: messageDoc,
          timestamp: Date.now()
        });
      }

      console.log(`📋 Queue size: ${this.sendQueue.length}`);

    } catch (error) {
      console.error('❌ Error queueing messages:', error.message);
    }
  }

  formatMessage(messageDoc, groupConfig) {
    let template = groupConfig.messageTemplate;
    
    // Format all bonus codes
    let allBonusCodesText = '';
    if (messageDoc.allBonusCodes && messageDoc.allBonusCodes.length > 0) {
      allBonusCodesText = messageDoc.allBonusCodes.map(code => `\`${code}\``).join('\n');
    } else if (messageDoc.bonusCode) {
      allBonusCodesText = `\`${messageDoc.bonusCode}\``;
    }
    
    // Replace placeholders with actual data
    const replacements = {
      '{channelName}': messageDoc.channelName,
      '{bonusCode}': messageDoc.bonusCode || 'Bulunamadı',
      '{allBonusCodes}': allBonusCodesText,
      '{websiteUrl}': messageDoc.websiteUrl || 'Bulunamadı',
      '{messageText}': this.truncateText(messageDoc.text, 200),
      '{messageDate}': this.formatDate(messageDoc.messageDate),
      '{keywords}': messageDoc.matchedKeywords.join(', ')
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      template = template.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    return template;
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  formatDate(date) {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  }

  startQueueProcessor() {
    setInterval(async () => {
      if (!this.isProcessingQueue && this.sendQueue.length > 0) {
        await this.processQueue();
      }
    }, 1000); // Check every second
  }

  async processQueue() {
    if (this.sendQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    const settings = channelsConfig.settings.messaging;

    try {
      // Process messages in batches
      const batchSize = settings.batchSize;
      const batch = this.sendQueue.splice(0, batchSize);

      console.log(`📤 Processing batch of ${batch.length} messages`);

      for (const queueItem of batch) {
        try {
          await this.sendSingleMessage(queueItem);
          this.sentCount++;

          // Add delay between messages
          if (settings.sendDelay > 0) {
            await this.sleep(settings.sendDelay);
          }

        } catch (error) {
          console.error(`❌ Failed to send message to ${queueItem.groupData.config.name}:`, error.message);
          
          // Handle flood wait
          if (error.message.includes('FLOOD_WAIT')) {
            const waitTime = this.extractFloodWaitTime(error.message);
            console.log(`⏳ Flood wait: ${waitTime} seconds. Pausing queue processing...`);
            
            // Put the message back in queue
            this.sendQueue.unshift(queueItem);
            
            // Wait before processing more
            await this.sleep(waitTime * 1000);
          }
        }
      }

    } catch (error) {
      console.error('❌ Error processing message queue:', error.message);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  async sendSingleMessage(queueItem) {
    const { groupData, message, originalMessage } = queueItem;
    
    try {
      console.log(`📨 Sending to ${groupData.config.name}...`);
      
      // Ensure client is connected
      if (!this.telegramClient.isClientConnected()) {
        await this.telegramClient.connect();
      }

      // Send the message
      await this.telegramClient.client.sendMessage(groupData.entity, {
        message: message
      });

      console.log(`✅ Message sent to ${groupData.config.name}`);
      
      // Mark original message as processed
      if (originalMessage._id) {
        await require('../shared/models/Message').findByIdAndUpdate(
          originalMessage._id,
          { processed: true }
        );
        console.log(`📝 Message ${originalMessage.messageId} marked as processed in database`);
      }

    } catch (error) {
      console.error(`❌ Failed to send message to ${groupData.config.name}:`, error.message);
      throw error;
    }
  }

  extractFloodWaitTime(errorMessage) {
    const match = errorMessage.match(/FLOOD_WAIT_(\d+)/);
    return match ? parseInt(match[1]) : 60;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendTestMessage(groupId, testMessage = "🔧 Test mesajı - Sistem çalışıyor!") {
    try {
      const groupData = this.groupEntities.get(groupId);
      
      if (!groupData) {
        throw new Error(`Group with ID ${groupId} not found`);
      }

      await this.telegramClient.client.sendMessage(groupData.entity, {
        message: testMessage
      });

      console.log(`✅ Test message sent to ${groupData.config.name}`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to send test message:`, error.message);
      throw error;
    }
  }

  clearQueue() {
    const queueSize = this.sendQueue.length;
    this.sendQueue = [];
    console.log(`🗑️ Cleared ${queueSize} messages from queue`);
  }

  getStats() {
    return {
      queueSize: this.sendQueue.length,
      isProcessingQueue: this.isProcessingQueue,
      sentCount: this.sentCount,
      targetGroups: this.groupEntities.size,
      groupConfigs: Array.from(this.groupEntities.values()).map(g => ({
        id: g.config.id,
        name: g.config.name,
        active: g.config.active
      }))
    };
  }

  async stop() {
    console.log('🛑 Stopping message sender...');
    this.clearQueue();
    this.groupEntities.clear();
    console.log('✅ Message sender stopped');
  }
}

module.exports = MessageSender; 