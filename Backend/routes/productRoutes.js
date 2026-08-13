const express = require("express");
const Product = require("../models/Product");
const protect = require("../middleware/authMiddleware");
const admin=require("../middleware/adminMiddleware");


const router = express.Router();

// @route POST /api/products
// @desc Create a new Product
// @access Private/Admin

router.post("/", protect,admin, async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      discountPrice,
      countInStock,
      category,
      brand,
      sizes,
      colors,
      collections,
      material,
      gender,
      images,
      isFeatured,
      isPublished,
      tags,
      dimensions,
      weight,
      sku,
    } = req.body;
    const product = new Product({
      name,
      description,
      price,
      discountPrice,
      countInStock,
      category,
      brand,
      sizes,
      colors,
      collections,
      material,
      gender,
      images,
      isFeatured,
      isPublished,
      tags,
      dimensions,
      weight,
      sku,
      user: req.user._id, // Reference to the admin user who created it.
    });
    const createdProduct = await product.save();
    return res.status(201).json(createdProduct);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error", error);
  }
});

// @route PUT/api/products/:id
// @desc Update an existing product ID
// @access Private/Admin

router.put("/:id",protect,admin,async(req,res)=>{
  try{
    const {
      name,
      description,
      price,
      discountPrice,
      countInStock,
      category,
      brand,
      sizes,
      colors,
      collections,
      material,
      gender,
      images,
      isFeatured,
      isPublished,
      tags,
      dimensions,
      weight,
      sku,
    } = req.body;

  } catch(error){

  }
})

module.exports = router;
