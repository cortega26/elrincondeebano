const fs = require('fs');
const path = require('path');

// Adjust path to ensure it correctly points to the _products directory at the root level
const productsFile = path.resolve(__dirname, '../../_products/products.json');
console.log('Products file path:', productsFile);

exports.handler = async function(event, context) {
    try {
        console.log('Attempting to read products file');
        const productsData = fs.readFileSync(productsFile, 'utf8');
        console.log('Products data:', productsData);
        const products = JSON.parse(productsData);
        console.log('Parsed products:', products);
        return {
            statusCode: 200,
            body: JSON.stringify(products),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    } catch (error) {
        console.error('Error loading products:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to load products' }),
        };
    }
};
