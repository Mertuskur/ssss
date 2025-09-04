const { TelegramClient: TelegramApiClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const config = require('../config/env');

class TelegramClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = config.telegram.connectionRetries;
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log('Telegram client already connected');
        return;
      }

      console.log('Connecting to Telegram...');
      
      const session = new StringSession(config.telegram.session);
      
      this.client = new TelegramApiClient(session, config.telegram.apiId, config.telegram.apiHash, {
        connectionRetries: this.maxRetries,
        retryDelay: 5000,
        autoReconnect: true,
        floodSleepThreshold: 60
      });

      await this.client.connect();
      
      this.isConnected = true;
      this.retryCount = 0;
      console.log('Telegram client connected successfully');

      // Handle connection events - disabled to avoid internal errors
      // this.client.addEventHandler(this.handleUpdate.bind(this), {});

    } catch (error) {
      console.error('Telegram connection failed:', error.message);
      await this.handleConnectionError();
    }
  }

  async handleConnectionError() {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      console.log(`Retrying Telegram connection... (${this.retryCount}/${this.maxRetries})`);
      setTimeout(() => this.connect(), 10000);
    } else {
      console.error('Max retry attempts reached. Could not connect to Telegram');
      throw new Error('Failed to connect to Telegram after multiple attempts');
    }
  }

  async handleUpdate(update) {
    // This will be used for real-time updates if needed
    // For now, we'll focus on manual fetching
    console.log('Received update:', update.className);
  }

  async getChannelEntity(username) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const entity = await this.client.getEntity(username);
      return entity;
    } catch (error) {
      console.error(`Error getting channel entity for ${username}:`, error.message);
      throw error;
    }
  }

  async getChannelMessages(channelUsername, limit = 50, offsetId = 0) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log(`Fetching messages from ${channelUsername}...`);
      
      const entity = await this.getChannelEntity(channelUsername);
      
      const messages = await this.client.getMessages(entity, {
        limit: limit,
        offsetId: offsetId,
        reverse: false
      });

      console.log(`Retrieved ${messages.length} messages from ${channelUsername}`);
      return messages;

    } catch (error) {
      console.error(`Error fetching messages from ${channelUsername}:`, error.message);
      
      // Handle flood wait
      if (error.message.includes('FLOOD_WAIT')) {
        const waitTime = this.extractFloodWaitTime(error.message);
        console.log(`Flood wait detected. Waiting ${waitTime} seconds...`);
        await this.sleep(waitTime * 1000);
        return this.getChannelMessages(channelUsername, limit, offsetId);
      }
      
      throw error;
    }
  }

  extractFloodWaitTime(errorMessage) {
    const match = errorMessage.match(/FLOOD_WAIT_(\d+)/);
    return match ? parseInt(match[1]) : 60; // Default 60 seconds
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      console.log('Telegram client disconnected');
    }
  }

  isClientConnected() {
    return this.isConnected;
  }
}

module.exports = TelegramClient; 