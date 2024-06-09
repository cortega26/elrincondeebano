const fs = require('fs');
const path = require('path');

const productsFile = path.resolve('./_products/products.json');

exports.handler = async function(event, context) {
    try {
        const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
        return {
            statusCode: 200,
            body: JSON.stringify(products),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to load products' }),
        };
    }
};
