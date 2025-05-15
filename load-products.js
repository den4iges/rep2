const fs = require('fs').promises;
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const PRODUCTS_XML_PATH = path.join(__dirname, '..', 'data', 'products.xml');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'products');

// XML parser configuration
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
});

async function ensureDirectoryExists(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
}

async function verifyProductImages(products) {
    const missingImages = [];
    const existingImages = new Set();

    // Get list of existing images
    try {
        const files = await fs.readdir(IMAGES_DIR);
        files.forEach(file => existingImages.add(file));
    } catch (error) {
        console.error('Error reading images directory:', error.message);
        return [];
    }

    // Check each product's image
    products.forEach(category => {
        category.product.forEach(product => {
            if (!existingImages.has(product.image)) {
                missingImages.push({
                    productName: product.n,
                    imageName: product.image
                });
            }
        });
    });

    return missingImages;
}

async function loadAndVerifyProducts() {
    try {
        // Ensure directories exist
        await ensureDirectoryExists(path.dirname(PRODUCTS_XML_PATH));
        await ensureDirectoryExists(IMAGES_DIR);

        // Check if products.xml exists
        try {
            await fs.access(PRODUCTS_XML_PATH);
        } catch {
            console.error('Error: products.xml not found at:', PRODUCTS_XML_PATH);
            console.log('Please create products.xml with the correct structure.');
            process.exit(1);
        }

        // Read and parse products.xml
        const xmlData = await fs.readFile(PRODUCTS_XML_PATH, 'utf-8');
        const productsData = parser.parse(xmlData);

        if (!productsData.products || !productsData.products.category) {
            throw new Error('Invalid products.xml structure. Expected root element "products" with "category" elements.');
        }

        // Convert to array if single category
        const categories = Array.isArray(productsData.products.category) 
            ? productsData.products.category 
            : [productsData.products.category];

        // Verify product data structure
        categories.forEach((category, catIndex) => {
            if (!category.name) {
                throw new Error(`Category at index ${catIndex} is missing 'name' attribute`);
            }
            
            // Convert to array if single product
            const products = Array.isArray(category.product) ? category.product : [category.product];
            
            products.forEach((product, prodIndex) => {
                const requiredFields = ['id', 'n', 'description', 'price', 'image', 'stock'];
                requiredFields.forEach(field => {
                    if (!product[field]) {
                        throw new Error(`Product ${prodIndex} in category "${category.name}" is missing required field: ${field}`);
                    }
                });
            });
        });

        // Verify images
        const missingImages = await verifyProductImages(categories);
        
        if (missingImages.length > 0) {
            console.log('\nWarning: Missing product images:');
            missingImages.forEach(({ productName, imageName }) => {
                console.log(`- ${productName}: missing image '${imageName}'`);
            });
            console.log('\nPlease add the missing images to:', IMAGES_DIR);
        }

        console.log('\nProduct verification completed:');
        console.log('- Products XML structure: Valid');
        console.log(`- Total categories: ${categories.length}`);
        console.log(`- Total products: ${categories.reduce((sum, cat) => sum + (Array.isArray(cat.product) ? cat.product.length : 1), 0)}`);
        console.log(`- Images directory: ${IMAGES_DIR}`);
        console.log(`- Missing images: ${missingImages.length}`);

        return true;
    } catch (error) {
        console.error('\nError during product verification:', error.message);
        return false;
    }
}

// Run the script
loadAndVerifyProducts().then(success => {
    if (!success) {
        process.exit(1);
    }
    console.log('\nProduct loading and verification completed successfully!');
}); 