require('dotenv').config();

const config = {
  // Database Configuration
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/Apibet',
    options: {
      serverSelectionTimeoutMS: 30000,
      bufferCommands: false
    }
  },

  // Telegram API Configuration
  telegram: {
    apiId: parseInt(process.env.TELEGRAM_API_ID) || 25426771,
    apiHash: process.env.TELEGRAM_API_HASH || '8bbe187bea6c0ac180fa76a65dfe8a3b',
    session: process.env.TELEGRAM_SESSION || '1BAAOMTQ5LjE1NC4xNjcuOTEAUITc7lPLDZFaz4V8qSnUfbPMSmLQIYcujstYriAmQR25DzZ+8azOMGgyIDrWxylPtC219s2eZYrII2aSjoLArV+lXinlxPHlCpXm0hmizDKpIEFf4WRVkKUB/SrB36lvfQEfaHld+WjzINaFEKGIrLicBmpW/Sgm3UIv9pon8TIq4SZheyjspxQbkqxPoBjUuHXcd/jacdaEyBEW6E6+tbmCdOm02NCogkOcUBGLXcdX7cVWn05u5kOzUZA/ICiGOmxFlvciu93/53sP2FUDT+1Z0xyvcImhhIN3WE4XV9eDydsJAJm4nF7/YxDKrbZwrNXyVT/+7D/uwgw7leXXKwM=',
    connectionRetries: 5
  },

  // Scraping Configuration
  scraping: {
    interval: parseInt(process.env.SCRAPE_INTERVAL) || 300000, // 5 minutes
    maxMessagesPerFetch: parseInt(process.env.MAX_MESSAGES_PER_FETCH) || 50,
    batchSize: 10
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true'
  }
};

module.exports = config; 