const mongoose = require("mongoose");
const Product = require("./models/Product");
const products = require("./data/products");
const User = require("./models/User");
const Cart = require("./models/Cart");

const dotenv = require("dotenv");
const dns = require("dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

dotenv.config();

mongoose.connect(process.env.MONGO_URI);

const seedData = async () => {
  try {
    // Clear existing data
    await Product.deleteMany();
    await User.deleteMany();
    await Cart.deleteMany();
    // Create a default admin User

    const createdUser = await User.create({
      name: "Admin User",
      email: "admin@example.com",
      password: "123456",
      role: "admin",
    });

    // Assign the default user ID to each product
    const userID = createdUser._id;

    const sampleProducts = products.map((product) => {
      return { ...product, user: userID };
    });

    // Insert the products into the database
    await Product.insertMany(sampleProducts);
    console.log("Product data seeded successfully!");
    process.exit();
  } catch (error) {
    console.error("Error sending the data:", error);
  }
};

seedData();
