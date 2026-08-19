const express = require("express");
const mongoose = require("mongoose");
const Checkout = require("../models/Checkout");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Order = require("../models/Order");
const protect = require("../middleware/authMiddleware");

const router = express.Router();
const PAYPAL_API_BASE =
  process.env.PAYPAL_API_BASE ||
  (process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com");

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const toCents = (value) => Math.round(Number(value) * 100);

const createAuthoritativeItems = async (checkoutItems) => {
  if (!Array.isArray(checkoutItems) || checkoutItems.length === 0) {
    const error = new Error("No items in checkout");
    error.status = 400;
    throw error;
  }

  const requestedItems = checkoutItems.map((item) => ({
    productId: item?.productId,
    quantity: item?.quantity,
    size: item?.size,
    color: item?.color,
  }));
  for (const item of requestedItems) {
    if (!mongoose.isValidObjectId(item.productId)) {
      const error = new Error("Invalid product ID");
      error.status = 400;
      throw error;
    }
    if (!isPositiveInteger(item.quantity)) {
      const error = new Error("Quantity must be a positive integer");
      error.status = 400;
      throw error;
    }
  }

  const productIds = [...new Set(requestedItems.map((item) => String(item.productId)))];
  const products = await Product.find({ _id: { $in: productIds } });
  if (products.length !== productIds.length) {
    const error = new Error("One or more products no longer exist");
    error.status = 404;
    throw error;
  }
  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const quantitiesByProduct = new Map();
  const authoritativeItems = [];

  for (const item of requestedItems) {
    const product = productsById.get(String(item.productId));
    if (!product.sizes.includes(item.size)) {
      const error = new Error("Invalid product size");
      error.status = 400;
      throw error;
    }
    if (!product.colors.includes(item.color)) {
      const error = new Error("Invalid product color");
      error.status = 400;
      throw error;
    }
    if (!product.images?.[0]?.url) {
      const error = new Error("Product image is unavailable");
      error.status = 400;
      throw error;
    }

    const totalRequested = (quantitiesByProduct.get(String(product._id)) || 0) + item.quantity;
    if (totalRequested > product.countInStock) {
      const error = new Error("Insufficient stock");
      error.status = 400;
      throw error;
    }
    quantitiesByProduct.set(String(product._id), totalRequested);
    authoritativeItems.push({
      productId: product._id,
      name: product.name,
      image: product.images[0].url,
      price: product.price,
      quantity: item.quantity,
      size: item.size,
      color: item.color,
    });
  }

  const totalCents = authoritativeItems.reduce(
    (total, item) => total + toCents(item.price) * item.quantity,
    0,
  );
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    const error = new Error("Invalid product price");
    error.status = 400;
    throw error;
  }
  return { authoritativeItems, totalPrice: totalCents / 100 };
};

const verifyPayPalOrder = async (paypalOrderId, expectedTotal) => {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    const error = new Error("Payment verification is not configured");
    error.status = 500;
    throw error;
  }

  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");
  const tokenResponse = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenResponse.ok) {
    const error = new Error("Unable to verify payment");
    error.status = 502;
    throw error;
  }
  const { access_token: accessToken } = await tokenResponse.json();
  const orderResponse = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!orderResponse.ok) {
    const error = new Error("Payment order could not be verified");
    error.status = 400;
    throw error;
  }

  const paypalOrder = await orderResponse.json();
  const purchaseUnits = paypalOrder.purchase_units || [];
  const captures = purchaseUnits.flatMap((unit) => unit.payments?.captures || []);
  const paidCents = purchaseUnits.reduce(
    (total, unit) => total + toCents(unit.amount?.value),
    0,
  );
  const currencyIsUsd = purchaseUnits.every((unit) => unit.amount?.currency_code === "USD");
  const capturesCompleted = captures.length > 0 && captures.every((capture) => capture.status === "COMPLETED");

  if (
    paypalOrder.status !== "COMPLETED" ||
    !capturesCompleted ||
    !currencyIsUsd ||
    paidCents !== toCents(expectedTotal)
  ) {
    const error = new Error("Payment verification failed");
    error.status = 400;
    throw error;
  }

  return {
    paypalOrderId: paypalOrder.id,
    payerId: paypalOrder.payer?.payer_id,
    captureIds: captures.map((capture) => capture.id),
    status: paypalOrder.status,
  };
};

router.post("/", protect, async (req, res) => {
  const { checkoutItems, shippingAddress, paymentMethod } = req.body;
  try {
    const { authoritativeItems, totalPrice } = await createAuthoritativeItems(checkoutItems);
    const newCheckout = await Checkout.create({
      user: req.user._id,
      checkoutItems: authoritativeItems,
      shippingAddress,
      paymentMethod,
      totalPrice,
      paymentStatus: "pending",
      isPaid: false,
    });
    return res.status(201).json(newCheckout);
  } catch (error) {
    console.error("Error creating checkout session", error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : "Server Error",
    });
  }
});

router.put("/:id/pay", protect, async (req, res) => {
  const paypalOrderId = req.body?.paymentDetails?.id || req.body?.paypalOrderId;
  if (!paypalOrderId || typeof paypalOrderId !== "string") {
    return res.status(400).json({ message: "PayPal order ID is required" });
  }

  try {
    const checkout = await Checkout.findOne({ _id: req.params.id, user: req.user._id });
    if (!checkout) return res.status(404).json({ message: "Checkout not found" });

    if (checkout.isPaid) {
      if (checkout.paypalOrderId === paypalOrderId) {
        return res.json({ message: "Payment already recorded", checkout });
      }
      return res.status(409).json({ message: "Checkout has already been paid" });
    }

    const existingPayment = await Checkout.findOne({
      paypalOrderId,
      _id: { $ne: checkout._id },
    });
    if (existingPayment) {
      return res.status(409).json({ message: "PayPal order has already been used" });
    }

    const paymentDetails = await verifyPayPalOrder(paypalOrderId, checkout.totalPrice);
    checkout.isPaid = true;
    checkout.paymentStatus = "paid";
    checkout.paymentDetails = paymentDetails;
    checkout.paypalOrderId = paymentDetails.paypalOrderId;
    checkout.paidAt = new Date();
    await checkout.save();
    return res.json({ message: "Payment successful", checkout });
  } catch (error) {
    console.error("Error updating checkout payment", error);
    if (error?.code === 11000) {
      return res.status(409).json({ message: "PayPal order has already been used" });
    }
    return res.status(error.status || 500).json({
      message: error.status ? error.message : "Server Error",
    });
  }
});

router.post("/:id/finalize", protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid checkout ID" });
  }

  const session = await mongoose.startSession();
  let finalOrder;
  let wasAlreadyFinalized = false;
  try {
    await session.withTransaction(async () => {
      const checkout = await Checkout.findOne({
        _id: req.params.id,
        user: req.user._id,
      }).session(session);
      if (!checkout) {
        const error = new Error("Checkout not found");
        error.status = 404;
        throw error;
      }
      if (!checkout.isPaid) {
        const error = new Error("Checkout is not paid");
        error.status = 400;
        throw error;
      }

      const existingOrder = await Order.findOne({ checkout: checkout._id }).session(session);
      if (checkout.isFinalized || existingOrder) {
        if (!existingOrder) {
          const error = new Error("Finalized checkout has no order");
          error.status = 409;
          throw error;
        }
        if (!checkout.isFinalized) {
          checkout.isFinalized = true;
          checkout.finalizedAt = checkout.finalizedAt || new Date();
          checkout.order = existingOrder._id;
          await checkout.save({ session });
        }
        finalOrder = existingOrder;
        wasAlreadyFinalized = true;
        return;
      }

      for (const item of checkout.checkoutItems) {
        const product = await Product.findOneAndUpdate(
          { _id: item.productId, countInStock: { $gte: item.quantity } },
          { $inc: { countInStock: -item.quantity } },
          { new: true, session },
        );
        if (!product) {
          const error = new Error("Insufficient stock");
          error.status = 409;
          throw error;
        }
      }

      const [createdOrder] = await Order.create([{
        checkout: checkout._id,
        user: checkout.user,
        orderItems: checkout.checkoutItems,
        shippingAddress: checkout.shippingAddress,
        paymentMethod: checkout.paymentMethod,
        totalPrice: checkout.totalPrice,
        isPaid: true,
        paidAt: checkout.paidAt,
        isDelivered: false,
        paymentStatus: "paid",
        paymentDetails: checkout.paymentDetails,
      }], { session });

      checkout.isFinalized = true;
      checkout.finalizedAt = new Date();
      checkout.order = createdOrder._id;
      await checkout.save({ session });
      await Cart.findOneAndDelete({ user: checkout.user }).session(session);
      finalOrder = createdOrder;
    });
    return res.status(wasAlreadyFinalized ? 200 : 201).json(finalOrder);
  } catch (error) {
    console.error("Error finalizing checkout", error);
    if (error?.code === 11000) {
      const existingOrder = await Order.findOne({ checkout: req.params.id });
      if (existingOrder) return res.json(existingOrder);
    }
    return res.status(error.status || 500).json({
      message: error.status ? error.message : "Server Error",
    });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
