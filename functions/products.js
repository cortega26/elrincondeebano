const fs = require('fs');
const path = require('path');

const productsFile = path.join(__dirname, '../public/_products/products.json');
console.log('Products file path:', productsFile);

exports.handler = async function(event, context) {
    try {
        console.log('Attempting to read products file');
        const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
        console.log('Products loaded successfully');
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