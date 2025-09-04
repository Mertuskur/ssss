const mongoose = require('mongoose');
const config = require('../config/env');

class Database {
  constructor() {
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = 5;
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log('MongoDB already connected');
        return;
      }

      console.log('Connecting to MongoDB...');
      await mongoose.connect(config.mongodb.uri, config.mongodb.options);
      
      this.isConnected = true;
      this.retryCount = 0;
      console.log('MongoDB connected successfully');

      // Connection event listeners
      mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
        this.handleConnectionError();
      });

    } catch (error) {
      console.error('MongoDB connection failed:', error.message);
      await this.handleConnectionError();
    }
  }

  async handleConnectionError() {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      console.log(`Retrying MongoDB connection... (${this.retryCount}/${this.maxRetries})`);
      setTimeout(() => this.connect(), 5000);
    } else {
      console.error('Max retry attempts reached. Could not connect to MongoDB');
      process.exit(1);
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('MongoDB disconnected');
    }
  }

  getConnection() {
    return mongoose.connection;
  }
}

module.exports = new Database(); 