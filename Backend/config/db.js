const mongoose = require("mongoose");
const dns = require("node:dns").promises;

// Use public DNS only for Node's DNS lookups.
// Does not modify Windows/company network settings.
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connection Successful");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
