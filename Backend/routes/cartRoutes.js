const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

// Guest carts stay public. When a bearer token is present, its user is the only
// identity used for cart access; client supplied user IDs are never trusted.
const optionalProtect = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) return next();
  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }

  try {
    const token = authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.user._id).select("-password");
    if (!user) return res.status(401).json({ message: "User not found" });
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

router.use(optionalProtect);

const getCart = (userId, guestId) => {
  if (userId) return Cart.findOne({ user: userId });
  if (guestId) return Cart.findOne({ guestId });
  return null;
};

const getCartIdentity = (req, suppliedUserId, guestId, res) => {
  if (req.user) return { userId: req.user._id, guestId: undefined };
  if (suppliedUserId) {
    res.status(401).json({ message: "Authentication is required for a user cart" });
    return null;
  }
  if (!guestId || typeof guestId !== "string") {
    res.status(400).json({ message: "Guest ID is required" });
    return null;
  }
  return { userId: undefined, guestId };
};

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

const validateCartItem = async ({ productId, quantity, size, color }) => {
  if (!mongoose.isValidObjectId(productId)) return { error: "Invalid product ID" };
  if (!isPositiveInteger(quantity)) {
    return { error: "Quantity must be a positive integer" };
  }

  const product = await Product.findById(productId);
  if (!product) return { error: "Product not found", status: 404 };
  if (!product.sizes.includes(size)) return { error: "Invalid product size" };
  if (!product.colors.includes(color)) return { error: "Invalid product color" };
  if (quantity > product.countInStock) return { error: "Insufficient stock" };
  if (!product.images?.[0]?.url) return { error: "Product image is unavailable" };
  return { product };
};

const updateCartTotal = (cart) => {
  cart.totalPrice = cart.products.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );
};

router.post("/", async (req, res) => {
  const { productId, quantity, size, color, guestId, userId } = req.body;
  const identity = getCartIdentity(req, userId, guestId, res);
  if (!identity) return;

  try {
    const validation = await validateCartItem({ productId, quantity, size, color });
    if (validation.error) {
      return res.status(validation.status || 400).json({ message: validation.error });
    }
    const { product } = validation;
    const cart = await getCart(identity.userId, identity.guestId);

    if (cart) {
      const productIndex = cart.products.findIndex(
        (item) => item.productId.toString() === productId && item.size === size && item.color === color,
      );
      if (productIndex > -1) {
        const nextQuantity = cart.products[productIndex].quantity + quantity;
        if (nextQuantity > product.countInStock) {
          return res.status(400).json({ message: "Insufficient stock" });
        }
        cart.products[productIndex].quantity = nextQuantity;
      } else {
        cart.products.push({
          productId,
          name: product.name,
          image: product.images[0].url,
          price: product.price,
          size,
          color,
          quantity,
        });
      }
      updateCartTotal(cart);
      await cart.save();
      return res.status(201).json(cart);
    }

    const newCart = await Cart.create({
      user: identity.userId,
      guestId: identity.guestId,
      products: [{
        productId,
        name: product.name,
        image: product.images[0].url,
        price: product.price,
        size,
        color,
        quantity,
      }],
      totalPrice: product.price * quantity,
    });
    return res.status(201).json(newCart);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error" });
  }
});

router.get("/", async (req, res) => {
  const identity = getCartIdentity(req, req.query.userId, req.query.guestId, res);
  if (!identity) return;
  try {
    const cart = await getCart(identity.userId, identity.guestId);
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    return res.json(cart);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error" });
  }
});

router.put("/", async (req, res) => {
  const { productId, quantity, size, color, guestId, userId } = req.body;
  const identity = getCartIdentity(req, userId, guestId, res);
  if (!identity) return;

  try {
    const validation = await validateCartItem({ productId, quantity, size, color });
    if (validation.error) {
      return res.status(validation.status || 400).json({ message: validation.error });
    }
    const cart = await getCart(identity.userId, identity.guestId);
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const productIndex = cart.products.findIndex(
      (item) => item.productId.toString() === productId && item.size === size && item.color === color,
    );
    if (productIndex === -1) {
      return res.status(404).json({ message: "Product not found in cart" });
    }
    cart.products[productIndex].quantity = quantity;
    updateCartTotal(cart);
    await cart.save();
    return res.json(cart);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error" });
  }
});

router.delete("/", async (req, res) => {
  const { productId, size, color, guestId, userId } = req.body;
  const identity = getCartIdentity(req, userId, guestId, res);
  if (!identity) return;

  try {
    const cart = await getCart(identity.userId, identity.guestId);
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    const productIndex = cart.products.findIndex(
      (item) => item.productId.toString() === productId && item.size === size && item.color === color,
    );
    if (productIndex === -1) {
      return res.status(404).json({ message: "Product not found in cart" });
    }
    cart.products.splice(productIndex, 1);
    updateCartTotal(cart);
    await cart.save();
    return res.json(cart);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error" });
  }
});

router.post("/merge", protect, async (req, res) => {
  const { guestId } = req.body;
  if (!guestId || typeof guestId !== "string") {
    return res.status(400).json({ message: "Guest ID is required" });
  }

  try {
    const guestCart = await Cart.findOne({ guestId });
    const userCart = await Cart.findOne({ user: req.user._id });
    if (!guestCart) {
      if (userCart) return res.json(userCart);
      return res.status(404).json({ message: "Guest cart not found" });
    }
    if (guestCart.products.length === 0) {
      return res.status(400).json({ message: "Guest cart is empty" });
    }

    if (userCart) {
      guestCart.products.forEach((guestItem) => {
        const productIndex = userCart.products.findIndex(
          (item) =>
            item.productId.toString() === guestItem.productId.toString() &&
            item.size === guestItem.size &&
            item.color === guestItem.color,
        );
        if (productIndex > -1) userCart.products[productIndex].quantity += guestItem.quantity;
        else userCart.products.push(guestItem);
      });
      updateCartTotal(userCart);
      await userCart.save();
      await Cart.findOneAndDelete({ guestId });
      return res.json(userCart);
    }

    guestCart.user = req.user._id;
    guestCart.guestId = undefined;
    await guestCart.save();
    return res.json(guestCart);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
