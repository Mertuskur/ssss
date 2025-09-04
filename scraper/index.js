const Database = require('../shared/database');
const ScraperService = require('./scraperService');

class TelegramScraperApp {
  constructor() {
    this.scraperService = new ScraperService();
    this.isShuttingDown = false;
  }

  async start() {
    try {
      console.log('🚀 Starting Telegram Scraper Application...');
      console.log('=====================================');
      
      // Connect to MongoDB
      await Database.connect();
      
      // Start scraper service
      await this.scraperService.start();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      console.log('✅ Application started successfully!');
      console.log('Press Ctrl+C to stop the application');
      
    } catch (error) {
      console.error('❌ Failed to start application:', error.message);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        console.log('Force shutdown...');
        process.exit(1);
      }
      
      this.isShuttingDown = true;
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      
      try {
        // Stop scraper service
        await this.scraperService.stop();
        
        // Disconnect from database
        await Database.disconnect();
        
        console.log('✅ Application shut down successfully');
        process.exit(0);
        
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      // Ignore telegram internal builder.resolve errors
      if (reason && reason.message && reason.message.includes('builder.resolve is not a function')) {
        console.log('⚠️ Ignoring telegram internal error:', reason.message);
        return;
      }
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }

  async getStatus() {
    const stats = this.scraperService.getStats();
    const dbConnection = Database.getConnection();
    
    return {
      application: {
        status: 'running',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid
      },
      database: {
        connected: dbConnection.readyState === 1,
        name: dbConnection.name,
        host: dbConnection.host
      },
      scraper: stats
    };
  }
}

// Start the application
if (require.main === module) {
  const app = new TelegramScraperApp();
  app.start();
}

module.exports = TelegramScraperApp; 