const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "data", "products.js");
const cloudinaryPath = path.join(__dirname, "cloudinary-images.json");

const productsFile = fs.readFileSync(productsPath, "utf8");
const cloudinaryImages = JSON.parse(fs.readFileSync(cloudinaryPath, "utf8"));

// Map filename -> Cloudinary URL
const imageMap = new Map(
  cloudinaryImages.map((image) => [image.fileName, image.url]),
);

// Match the existing picsum URL using its altText.
// We update URLs in the exact order they appear in products.js.
const imagePatterns = [/url:\s*"https:\/\/picsum\.photos\/[^"]+"/g];

let imageIndex = 0;

const allImages = [...productsFile.matchAll(imagePatterns[0])];

if (allImages.length === 0) {
  throw new Error("No picsum.photos URLs found in products.js");
}

// Build Cloudinary URLs in product/image order based on the
// filename naming convention we established.
const filenameOrder = [
  "oxford-shirt-01.jpg",
  "oxford-shirt-02.jpg",

  "slim-fit-stretch-shirt-01.jpg",
  "slim-fit-stretch-shirt-02.jpg",

  "casual-denim-shirt-01.jpg",
  "casual-denim-shirt-02.jpg",

  "printed-resort-shirt-01.jpg",
  "printed-resort-shirt-02.jpg",

  "slim-fit-easy-iron-shirt-01.jpg",
  "slim-fit-easy-iron-shirt-02.jpg",

  "polo-tshirt-ribbed-collar-01.jpg",
  "polo-tshirt-ribbed-collar-02.jpg",

  "oversized-graphic-tshirt-01.jpg",
  "regular-fit-henley-shirt-01.jpg",
  "long-sleeve-thermal-tee-01.jpg",
  "v-neck-classic-tshirt-01.jpg",

  "slim-fit-joggers-01.jpg",
  "cargo-joggers-01.jpg",
  "tapered-sweatpants-01.jpg",
  "denim-jeans-01.jpg",
  "chino-pants-01.jpg",
  "track-pants-01.jpg",
  "slim-fit-trousers-01.jpg",
  "cargo-pants-01.jpg",
  "relaxed-fit-sweatpants-01.jpg",
  "formal-dress-pants-01.jpg",

  "high-waist-skinny-jeans-01.jpg",
  "wide-leg-trousers-01.jpg",
  "stretch-leggings-01.jpg",
  "pleated-midi-skirt-01.jpg",
  "flared-palazzo-pants-01.jpg",
  "high-rise-joggers-01.jpg",
  "paperbag-waist-shorts-01.jpg",
  "stretch-denim-shorts-01.jpg",
  "culottes-01.jpg",
  "classic-pleated-trousers-01.jpg",

  "knitted-cropped-top-01.jpg",
  "boho-floral-blouse-01.jpg",
  "casual-tshirt-01.jpg",
  "off-shoulder-top-01.jpg",
  "lace-trimmed-cami-top-01.jpg",
  "graphic-print-tee-01.jpg",
  "ribbed-long-sleeve-top-01.jpg",
  "ruffle-sleeve-blouse-01.jpg",
  "classic-button-up-shirt-01.jpg",
  "v-neck-wrap-top-01.jpg",
];

if (allImages.length !== filenameOrder.length) {
  throw new Error(
    `Expected ${filenameOrder.length} image URLs in products.js, found ${allImages.length}`,
  );
}

let updatedProducts = productsFile;

for (const match of allImages) {
  const filename = filenameOrder[imageIndex];
  const cloudinaryUrl = imageMap.get(filename);

  if (!cloudinaryUrl) {
    throw new Error(`Cloudinary URL not found for: ${filename}`);
  }

  const oldValue = match[0];

  const newValue = `url: "${cloudinaryUrl}"`;

  updatedProducts = updatedProducts.replace(oldValue, newValue);

  console.log(`✓ ${filename}`);

  imageIndex++;
}

fs.writeFileSync(productsPath, updatedProducts, "utf8");

console.log("\n=================================");
console.log("products.js updated successfully!");
console.log(`Updated ${imageIndex} image URLs`);
console.log("=================================");
