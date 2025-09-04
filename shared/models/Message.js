const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Telegram Message Info
  messageId: {
    type: Number,
    required: true
  },
  channelId: {
    type: String,
    required: true,
    index: true
  },
  channelUsername: {
    type: String,
    required: true,
    index: true
  },
  channelName: {
    type: String,
    required: true
  },
  
  // Message Content
  text: {
    type: String,
    required: true,
    text: true // Text index for search
  },
  rawMessage: {
    type: mongoose.Schema.Types.Mixed, // Store full message object
    required: false
  },
  
  // Extracted Data
  bonusCode: {
    type: String,
    index: true
  },
  allBonusCodes: [{
    type: String
  }],
  websiteUrl: {
    type: String,
    index: true
  },
  
  // Keywords Found
  matchedKeywords: [{
    type: String
  }],
  
  // Dates
  messageDate: {
    type: Date,
    required: true,
    index: true
  },
  scrapedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Status
  processed: {
    type: Boolean,
    default: false,
    index: true
  },
  hasBonus: {
    type: Boolean,
    default: false,
    index: true
  },
  hasWebsite: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'messages'
});

// Compound indexes
messageSchema.index({ channelId: 1, messageId: 1 }, { unique: true });
messageSchema.index({ scrapedAt: -1 });
messageSchema.index({ messageDate: -1 });
messageSchema.index({ channelUsername: 1, messageDate: -1 });

// Methods
messageSchema.methods.extractData = function() {
  const text = this.text.trim();
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  let bonusCodes = [];
  let websiteUrl = null;
  
  // First pass: Find backtick codes (highest priority)
  for (const line of lines) {
    const cleanLine = line.trim();
    
    // Look for codes in backticks
    const backtickMatches = cleanLine.match(/`([A-Za-z0-9]{4,20})`/g);
    if (backtickMatches) {
      backtickMatches.forEach(match => {
        const code = match.replace(/`/g, '');
        bonusCodes.push(code);
      });
    }
  }
  
  // Second pass: Process other lines
  for (const line of lines) {
    const cleanLine = line.trim();
    
    // Check if line is a URL
    if (cleanLine.includes('http') || cleanLine.includes('.com') || 
        cleanLine.includes('.net') || cleanLine.includes('.org')) {
      
      // Extract website URL
      if (cleanLine.startsWith('http')) {
        websiteUrl = cleanLine;
      } else {
        // Find domain and add https://
        const domainMatch = cleanLine.match(/([a-zA-Z0-9-]+\.(com|net|org|co\.uk|tr))/i);
        if (domainMatch) {
          websiteUrl = 'https://' + domainMatch[0];
        }
      }
    } else if (!cleanLine.includes('`') && bonusCodes.length === 0) {
      // Only add non-backtick codes if no backtick codes found
      // This line should be a bonus code
      // Clean and validate
      const code = cleanLine.replace(/[^A-Za-z0-9]/g, ''); // Remove special chars
      
      if (code.length >= 4 && code.length <= 20) {
        bonusCodes.push(code);
      }
    }
  }
  
  // Set the results
  if (websiteUrl) {
    this.websiteUrl = websiteUrl;
    this.hasWebsite = true;
  }
  
  if (bonusCodes.length > 0) {
    // Use the first bonus code as primary
    this.bonusCode = bonusCodes[0];
    this.hasBonus = true;
    
    // Store all codes for potential use (could be used in message template)
    this.allBonusCodes = bonusCodes;
    
    // Log all found codes for debugging
    console.log(`DEBUG: Found bonus codes: [${bonusCodes.join(', ')}] | Website: ${websiteUrl}`);
  }
  
  // Only mark as valid if we have BOTH bonus code AND website
  if (!this.hasBonus || !this.hasWebsite) {
    this.hasBonus = false;
    this.bonusCode = null;
    console.log(`DEBUG: Invalid format - hasBonus: ${this.hasBonus}, hasWebsite: ${this.hasWebsite}`);
  }
  
  return this;
};

// Statics
messageSchema.statics.findByChannel = function(channelUsername) {
  return this.find({ channelUsername }).sort({ messageDate: -1 });
};

messageSchema.statics.findWithBonus = function() {
  return this.find({ hasBonus: true }).sort({ messageDate: -1 });
};

messageSchema.statics.getLatestByChannel = function(channelUsername, limit = 50) {
  return this.find({ channelUsername })
    .sort({ messageDate: -1 })
    .limit(limit);
};

module.exports = mongoose.model('Message', messageSchema); 