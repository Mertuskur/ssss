require('dotenv').config();




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
