const fs = require("fs");
const path = require("path");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const imagesRoot = path.join(__dirname, "..", "product-images");

const categories = [
  "mens-topwear",
  "mens-bottomwear",
  "womens-bottomwear",
  "womens-topwear",
];

const uploadImage = async (filePath, category) => {
  const fileName = path.parse(filePath).name;

  const result = await cloudinary.uploader.upload(filePath, {
    folder: `rabbit/products/${category}`,
    public_id: fileName,
    resource_type: "image",
    overwrite: true,
  });

  return {
    category,
    fileName: path.basename(filePath),
    url: result.secure_url,
  };
};

const uploadAllImages = async () => {
  const uploadedImages = [];

  for (const category of categories) {
    const categoryPath = path.join(imagesRoot, category);

    if (!fs.existsSync(categoryPath)) {
      console.log(`Folder not found: ${category}`);
      continue;
    }

    const files = fs
      .readdirSync(categoryPath)
      .filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file));

    console.log(`\nUploading ${category}: ${files.length} images`);

    for (const file of files) {
      const filePath = path.join(categoryPath, file);

      try {
        const uploaded = await uploadImage(filePath, category);

        uploadedImages.push(uploaded);

        console.log(`✓ ${file}`);
      } catch (error) {
        console.error(`✗ ${file}`, error.message);
      }
    }
  }

  const outputPath = path.join(__dirname, "cloudinary-images.json");

  fs.writeFileSync(outputPath, JSON.stringify(uploadedImages, null, 2), "utf8");

  console.log("\n=================================");
  console.log(`Uploaded: ${uploadedImages.length} images`);
  console.log(`URLs saved to: ${outputPath}`);
  console.log("=================================");
};

uploadAllImages();
